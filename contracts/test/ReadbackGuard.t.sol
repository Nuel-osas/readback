// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ReadbackGuard, Operation} from "../src/ReadbackGuard.sol";

interface ISafeFull {
    function setup(address[] calldata, uint256, address, bytes calldata, address, address, uint256, address) external;
    function execTransaction(address, uint256, bytes calldata, Operation, uint256, uint256, uint256, address, address payable, bytes memory) external payable returns (bool);
    function getTransactionHash(address, uint256, bytes calldata, Operation, uint256, uint256, uint256, address, address, uint256) external view returns (bytes32);
    function nonce() external view returns (uint256);
    function setGuard(address) external;
}

interface IProxyFactory {
    function createProxyWithNonce(address singleton, bytes memory initializer, uint256 saltNonce) external returns (address);
}

/// @dev Runs against Safe's real contracts on a fork of Base mainnet.
abstract contract GuardForkBase is Test {
    ReadbackGuard guard;
    ISafeFull safe;
    uint256 k1 = 0xA11CE;
    uint256 k2 = 0xB0B;
    uint256 notaryKey = 0x5EA1;
    address notary;
    // Not makeAddr("alice"): on Base mainnet that well-known test address has a contract on it
    // that forwards incoming ETH elsewhere. Found when this suite first ran on a fork.
    address alice = makeAddr("readback.recipient");
    address thief = makeAddr("readback.thief");
    bytes32 constant RULES = keccak256("readback/0.1");

    function singleton() internal pure virtual returns (address);
    function factory() internal pure virtual returns (address);

    function setUp() public {
        vm.createSelectFork("base");
        notary = vm.addr(notaryKey);
        address[] memory owners = new address[](2);
        owners[0] = vm.addr(k1);
        owners[1] = vm.addr(k2);
        bytes memory init = abi.encodeCall(ISafeFull.setup, (owners, 2, address(0), "", address(0), address(0), 0, address(0)));
        safe = ISafeFull(IProxyFactory(factory()).createProxyWithNonce(singleton(), init, uint256(keccak256("readback"))));
        vm.deal(address(safe), 10 ether);
        assertEq(alice.code.length, 0, "recipient must be a plain address on this fork");
        assertEq(thief.code.length, 0, "thief must be a plain address on this fork");

        guard = new ReadbackGuard(2 days);
        // Order matters: set the notary first, then enable the guard. Neither needs an attestation yet.
        _exec(address(guard), 0, abi.encodeCall(ReadbackGuard.setNotary, (notary)), Operation.Call, "");
        _exec(address(safe), 0, abi.encodeCall(ISafeFull.setGuard, (address(guard))), Operation.Call, "");
    }

    // ------------------------------------------------------------- helpers

    function _hash(address to, uint256 value, bytes memory data, Operation op, uint256 gasPrice, address refund) internal view returns (bytes32) {
        return safe.getTransactionHash(to, value, data, op, 0, 0, gasPrice, address(0), refund, safe.nonce());
    }

    function _ownerSigs(bytes32 h) internal view returns (bytes memory) {
        (uint256 a, uint256 b) = vm.addr(k1) < vm.addr(k2) ? (k1, k2) : (k2, k1);
        (uint8 v1, bytes32 r1, bytes32 s1) = vm.sign(a, h);
        (uint8 v2, bytes32 r2, bytes32 s2) = vm.sign(b, h);
        return abi.encodePacked(r1, s1, v1, r2, s2, v2);
    }

    function _attest(uint256 key, bytes32 safeTxHash, uint64 expiry) internal view returns (bytes memory) {
        bytes32 structHash = keccak256(abi.encode(guard.READBACK_TYPEHASH(), address(safe), safeTxHash, keccak256("intent"), RULES, expiry));
        bytes32 domain = keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("ReadbackGuard"), keccak256("1"), block.chainid, address(guard)));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, keccak256(abi.encodePacked("\x19\x01", domain, structHash)));
        bytes memory blob = abi.encode(keccak256("intent"), RULES, expiry, abi.encodePacked(r, s, v));
        return abi.encodePacked(blob, uint256(blob.length));
    }

    /// Owner signatures plus attestation, computed BEFORE any expectRevert so the cheatcode
    /// attaches to execTransaction and not to a view call inside a helper.
    function _sigs(address to, uint256 value, bytes memory data, Operation op, bytes memory attestation) internal view returns (bytes memory) {
        return abi.encodePacked(_ownerSigs(_hash(to, value, data, op, 0, address(0))), attestation);
    }

    function _exec(address to, uint256 value, bytes memory data, Operation op, bytes memory attestation) internal {
        bytes memory s = _sigs(to, value, data, op, attestation);
        safe.execTransaction(to, value, data, op, 0, 0, 0, address(0), payable(address(0)), s);
    }

    // ------------------------------------------------------------- the invariant

    function test_matchedTransactionExecutes() public {
        bytes32 h = _hash(alice, 1 ether, "", Operation.Call, 0, address(0));
        vm.expectEmit(true, true, false, true, address(guard));
        emit ReadbackGuard.ReadBack(address(safe), h, keccak256("intent"), RULES, notary);
        _exec(alice, 1 ether, "", Operation.Call, _attest(notaryKey, h, uint64(block.timestamp + 300)));
        assertEq(alice.balance, 1 ether);
    }

    function test_unattestedTransactionReverts() public {
        bytes32 h = _hash(alice, 1 ether, "", Operation.Call, 0, address(0));
        vm.expectRevert(ReadbackGuard.NotReadBack.selector);
        safe.execTransaction(alice, 1 ether, "", Operation.Call, 0, 0, 0, address(0), payable(address(0)), _ownerSigs(h));
    }

    /// Bybit: both owners sign a DELEGATECALL they were shown as a transfer. The notary decoded
    /// the real calldata and refused, so there is no attestation, and the chain refuses too.
    function test_bybitShapeWithOwnerSignaturesButNoAttestationReverts() public {
        bytes memory payload = abi.encodeWithSignature("transfer(address,uint256)", thief, 0);
        bytes32 h = _hash(thief, 0, payload, Operation.DelegateCall, 0, address(0));
        vm.expectRevert(ReadbackGuard.NotReadBack.selector);
        safe.execTransaction(thief, 0, payload, Operation.DelegateCall, 0, 0, 0, address(0), payable(address(0)), _ownerSigs(h));
    }

    /// An attestation for the transaction that was said cannot be moved onto a different one.
    function test_attestationForOneTransactionCannotAuthoriseAnother() public {
        bytes32 said = _hash(alice, 1 ether, "", Operation.Call, 0, address(0));
        bytes memory att = _attest(notaryKey, said, uint64(block.timestamp + 300));
        bytes32 swapped = _hash(thief, 1 ether, "", Operation.Call, 0, address(0));
        vm.expectRevert(ReadbackGuard.NotReadBack.selector);
        safe.execTransaction(thief, 1 ether, "", Operation.Call, 0, 0, 0, address(0), payable(address(0)), abi.encodePacked(_ownerSigs(swapped), att));
    }

    /// The Fiducia gap, closed: the owners sign a version that pays a gas refund to a thief.
    /// The attestation covered the refund-free transaction, so it does not verify.
    function test_gasRefundFieldsAreBound() public {
        bytes32 attested = _hash(alice, 1 ether, "", Operation.Call, 0, address(0));
        bytes memory att = _attest(notaryKey, attested, uint64(block.timestamp + 300));
        bytes32 withRefund = _hash(alice, 1 ether, "", Operation.Call, 1 gwei, thief);
        vm.expectRevert(ReadbackGuard.NotReadBack.selector);
        safe.execTransaction(alice, 1 ether, "", Operation.Call, 0, 0, 1 gwei, address(0), payable(thief), abi.encodePacked(_ownerSigs(withRefund), att));
    }

    function test_wrongNotaryReverts() public {
        bytes32 h = _hash(alice, 1 ether, "", Operation.Call, 0, address(0));
        bytes memory s = _sigs(alice, 1 ether, "", Operation.Call, _attest(0xBAD, h, uint64(block.timestamp + 300)));
        vm.expectRevert(ReadbackGuard.NotReadBack.selector);
        safe.execTransaction(alice, 1 ether, "", Operation.Call, 0, 0, 0, address(0), payable(address(0)), s);
    }

    function test_expiredAttestationReverts() public {
        bytes32 h = _hash(alice, 1 ether, "", Operation.Call, 0, address(0));
        bytes memory s = _sigs(alice, 1 ether, "", Operation.Call, _attest(notaryKey, h, uint64(block.timestamp + 60)));
        vm.warp(block.timestamp + 61);
        vm.expectRevert(ReadbackGuard.AttestationExpired.selector);
        safe.execTransaction(alice, 1 ether, "", Operation.Call, 0, 0, 0, address(0), payable(address(0)), s);
    }

    function test_attestationCannotBeReplayed() public {
        bytes32 h = _hash(alice, 1 ether, "", Operation.Call, 0, address(0));
        bytes memory att = _attest(notaryKey, h, uint64(block.timestamp + 300));
        _exec(alice, 1 ether, "", Operation.Call, att);
        // Same transaction again: the nonce moved, so its hash differs from the one attested.
        bytes32 h2 = _hash(alice, 1 ether, "", Operation.Call, 0, address(0));
        vm.expectRevert(ReadbackGuard.NotReadBack.selector);
        safe.execTransaction(alice, 1 ether, "", Operation.Call, 0, 0, 0, address(0), payable(address(0)), abi.encodePacked(_ownerSigs(h2), att));
    }

    // ------------------------------------------------------------- recovery never bricks

    function test_exitNeedsNoNotaryButWaitsTheDelay() public {
        _exec(address(guard), 0, abi.encodeCall(ReadbackGuard.scheduleExit, ()), Operation.Call, "");
        bytes memory remove = abi.encodeCall(ISafeFull.setGuard, (address(0)));
        bytes32 h = _hash(address(safe), 0, remove, Operation.Call, 0, address(0));
        vm.expectRevert(ReadbackGuard.TooEarly.selector);
        safe.execTransaction(address(safe), 0, remove, Operation.Call, 0, 0, 0, address(0), payable(address(0)), _ownerSigs(h));

        vm.warp(block.timestamp + 2 days);
        _exec(address(safe), 0, remove, Operation.Call, "");
        // Guard gone: an unattested transaction now executes.
        _exec(alice, 1 ether, "", Operation.Call, "");
        assertEq(alice.balance, 1 ether);
    }

    function test_lostNotaryKeyRecoversAfterDelay() public {
        address fresh = vm.addr(0xF00D);
        _exec(address(guard), 0, abi.encodeCall(ReadbackGuard.scheduleNotary, (fresh)), Operation.Call, "");
        vm.expectRevert(ReadbackGuard.TooEarly.selector);
        guard.applyScheduledNotary(address(safe));
        vm.warp(block.timestamp + 2 days);
        guard.applyScheduledNotary(address(safe));
        assertEq(guard.notaryOf(address(safe)), fresh);
    }

    function test_exemptCallsCannotSmuggleValueOrDelegatecall() public {
        bytes memory sched = abi.encodeCall(ReadbackGuard.scheduleExit, ());
        bytes32 h = _hash(address(guard), 0, sched, Operation.DelegateCall, 0, address(0));
        vm.expectRevert(ReadbackGuard.NotReadBack.selector);
        safe.execTransaction(address(guard), 0, sched, Operation.DelegateCall, 0, 0, 0, address(0), payable(address(0)), _ownerSigs(h));
    }

    function test_reportsGuardInterface() public view {
        assertTrue(guard.supportsInterface(0xe6d7a83a)); // Safe Guard / ITransactionGuard interface id
    }
}

contract ReadbackGuard_Safe141 is GuardForkBase {
    function singleton() internal pure override returns (address) { return 0x29fcB43b46531BcA003ddC8FCB67FFE91900C762; } // SafeL2 1.4.1
    function factory() internal pure override returns (address) { return 0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67; }
}

contract ReadbackGuard_Safe130 is GuardForkBase {
    function singleton() internal pure override returns (address) { return 0xfb1bffC9d739B8D520DaF37dF666da4C687191EA; } // GnosisSafeL2 1.3.0
    function factory() internal pure override returns (address) { return 0xC22834581EbC8527d974F8a1c97E1bEA4EF910BC; }
}
