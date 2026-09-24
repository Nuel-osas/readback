// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";

enum Operation {
    Call,
    DelegateCall
}

/// @dev Safe's transaction guard interface. Identical in v1.3.0, v1.4.1 and v1.5.0
///      (renamed ITransactionGuard in 1.5.0; the functions, and so the ERC-165 id, are unchanged).
interface ITransactionGuard {
    function checkTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes calldata signatures,
        address msgSender
    ) external;

    function checkAfterExecution(bytes32 hash, bool success) external;
}

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

interface ISafe {
    function nonce() external view returns (uint256);
    function getTransactionHash(
        address to,
        uint256 value,
        bytes calldata data,
        Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        uint256 _nonce
    ) external view returns (bytes32);
}

/**
 * @title ReadbackGuard
 * @notice A Safe transaction guard that refuses any transaction the Readback notary has not
 *         attested. The notary attests only after decoding the transaction itself and finding
 *         that every effect matches what the signer said aloud.
 *
 * Design, and what it deliberately does differently from the precedents it borrows from:
 *
 *  - Transport is Fiducia's: the attestation rides at the end of the Safe `signatures` bytes,
 *    followed by its length as a 32-byte word. Safe ignores trailing bytes.
 *  - Unlike Fiducia, the notary signs the FULL Safe tx hash. Fiducia zeroes safeTxGas, baseGas,
 *    gasPrice, gasToken and refundReceiver before its cosigner check, which leaves the gas
 *    refund path unbound. Here a single changed field invalidates the attestation.
 *  - Unlike Fiducia, an attestation never allowlists anything. Every transaction needs its own.
 *    Fiducia records each cosigned (to, selector, operation) as permanently allowed, so one
 *    cosigned `USDC.approve(router, 100)` lets every later `USDC.approve` through unchecked.
 *  - The Safe tx hash contains the nonce, so an attestation cannot be replayed. No replay code.
 *
 * Recovery, so a lost notary key never bricks a Safe. Three calls pass without an attestation,
 * each starting a public delay of `DELAY` first (the pattern Guardrail and Fiducia use for guard
 * removal): scheduling an exit, scheduling a new notary, and, once an exit has matured,
 * `setGuard(address(0))`.
 *
 * Modules: in Safe v1.3.0 and v1.4.1 module transactions do not pass through transaction
 * guards. Readback's rules refuse to attest `enableModule` unless it was said and the module is
 * verified; modules already enabled remain trusted by the Safe's own earlier decision.
 */
contract ReadbackGuard is ITransactionGuard, IERC165, EIP712 {
    /// @dev keccak256("Readback(address safe,bytes32 safeTxHash,bytes32 intentHash,bytes32 rules,uint64 expiry)")
    bytes32 public constant READBACK_TYPEHASH =
        keccak256("Readback(address safe,bytes32 safeTxHash,bytes32 intentHash,bytes32 rules,uint64 expiry)");

    /// @dev Safe.setGuard(address)
    bytes4 private constant SET_GUARD = 0xe19a9dd9;

    uint256 public immutable DELAY;

    struct Pending {
        address notary;
        uint64 at;
    }

    mapping(address safe => address) public notaryOf;
    mapping(address safe => uint256) public exitAt;
    mapping(address safe => Pending) public pendingNotary;

    event NotarySet(address indexed safe, address indexed notary);
    event ReadBack(address indexed safe, bytes32 indexed safeTxHash, bytes32 intentHash, bytes32 rules, address notary);
    event ExitScheduled(address indexed safe, uint256 at);
    event ExitCancelled(address indexed safe);
    event NotaryScheduled(address indexed safe, address indexed notary, uint256 at);

    error NotReadBack();
    error AttestationExpired();
    error NothingPending();
    error TooEarly();

    constructor(uint256 delay) EIP712("ReadbackGuard", "1") {
        DELAY = delay;
    }

    // ---------------------------------------------------------------- guard hooks

    function checkTransaction(
        address to,
        uint256 value,
        bytes calldata data,
        Operation operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address payable refundReceiver,
        bytes calldata signatures,
        address
    ) external override {
        address safe = msg.sender;
        address notary = notaryOf[safe];
        if (notary == address(0)) return; // not configured for this Safe: inert
        if (_exempt(safe, to, value, data, operation)) return;

        // The guard runs after Safe has incremented its nonce.
        bytes32 safeTxHash = ISafe(safe).getTransactionHash(
            to, value, data, operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, ISafe(safe).nonce() - 1
        );
        _verify(safe, notary, safeTxHash, signatures);
    }

    function checkAfterExecution(bytes32, bool) external override {}

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(ITransactionGuard).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    // ---------------------------------------------------------------- configuration (called by the Safe)

    /// @notice Set this Safe's notary. Before the guard is enabled this takes effect immediately.
    ///         Once enabled, the call itself must be attested, so it still takes effect immediately.
    function setNotary(address notary) external {
        notaryOf[msg.sender] = notary;
        delete pendingNotary[msg.sender];
        emit NotarySet(msg.sender, notary);
    }

    /// @notice Recovery: schedule a new notary without an attestation. Takes effect after DELAY.
    function scheduleNotary(address notary) external {
        uint64 at = uint64(block.timestamp + DELAY);
        pendingNotary[msg.sender] = Pending(notary, at);
        emit NotaryScheduled(msg.sender, notary, at);
    }

    /// @notice Anyone can apply a matured scheduled notary.
    function applyScheduledNotary(address safe) external {
        Pending memory p = pendingNotary[safe];
        if (p.at == 0) revert NothingPending();
        if (block.timestamp < p.at) revert TooEarly();
        notaryOf[safe] = p.notary;
        delete pendingNotary[safe];
        emit NotarySet(safe, p.notary);
    }

    /// @notice Recovery: schedule removal of this guard. After DELAY, `setGuard(address(0))` passes unattested.
    function scheduleExit() external {
        uint256 at = block.timestamp + DELAY;
        exitAt[msg.sender] = at;
        emit ExitScheduled(msg.sender, at);
    }

    function cancelExit() external {
        delete exitAt[msg.sender];
        emit ExitCancelled(msg.sender);
    }

    /// @notice The EIP-712 digest a notary signs for one transaction. Exposed so independent
    ///         notary implementations can check their encoding against the chain.
    function digest(address safe, bytes32 safeTxHash, bytes32 intentHash, bytes32 rules, uint64 expiry)
        public
        view
        returns (bytes32)
    {
        return _hashTypedDataV4(keccak256(abi.encode(READBACK_TYPEHASH, safe, safeTxHash, intentHash, rules, expiry)));
    }

    // ---------------------------------------------------------------- internals

    /// @dev Exactly four shapes pass without an attestation, and each is either inert or delayed.
    function _exempt(address safe, address to, uint256 value, bytes calldata data, Operation operation)
        internal
        returns (bool)
    {
        if (operation != Operation.Call || value != 0 || data.length < 4) return false;
        bytes4 selector = bytes4(data[:4]);

        if (to == address(this)) {
            return selector == this.scheduleExit.selector || selector == this.cancelExit.selector
                || selector == this.scheduleNotary.selector;
        }

        // A matured exit: exactly setGuard(address(0)) on the Safe itself.
        if (to == safe && selector == SET_GUARD && data.length == 36 && bytes32(data[4:36]) == bytes32(0)) {
            uint256 at = exitAt[safe];
            if (at == 0 || block.timestamp < at) revert TooEarly();
            delete exitAt[safe];
            return true;
        }
        return false;
    }

    /// @dev Attestation layout at the tail of `signatures`:
    ///      abi.encode(bytes32 intentHash, bytes32 rules, uint64 expiry, bytes signature) ++ uint256(length)
    function _verify(address safe, address notary, bytes32 safeTxHash, bytes calldata signatures) internal {
        if (signatures.length < 32) revert NotReadBack();
        uint256 end = signatures.length - 32;
        uint256 len = uint256(bytes32(signatures[end:]));
        if (len == 0 || len > end) revert NotReadBack();

        (bytes32 intentHash, bytes32 rules, uint64 expiry, bytes memory sig) =
            abi.decode(signatures[end - len:end], (bytes32, bytes32, uint64, bytes));
        if (expiry < block.timestamp) revert AttestationExpired();

        if (!SignatureChecker.isValidSignatureNow(notary, digest(safe, safeTxHash, intentHash, rules, expiry), sig)) {
            revert NotReadBack();
        }

        emit ReadBack(safe, safeTxHash, intentHash, rules, notary);
    }
}
