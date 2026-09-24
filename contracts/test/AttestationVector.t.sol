// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {ReadbackGuard, Operation} from "../src/ReadbackGuard.sol";

/// The JS notary (packages/core/src/attest.js) and the guard must agree byte for byte.
contract AttestationVectorTest is Test {
    function test_jsNotaryOutputIsAcceptedByTheGuard() public {
        string memory j = vm.readFile("../vectors/attestation-0.json");
        address guardAt = vm.parseJsonAddress(j, ".guard");
        address safe = vm.parseJsonAddress(j, ".safe");
        bytes32 safeTxHash = vm.parseJsonBytes32(j, ".safeTxHash");
        bytes memory tail = vm.parseJsonBytes(j, ".bytes");

        vm.chainId(vm.parseJsonUint(j, ".chainId"));
        deployCodeTo("ReadbackGuard.sol:ReadbackGuard", abi.encode(uint256(2 days)), guardAt);
        ReadbackGuard guard = ReadbackGuard(guardAt);

        // Same digest on both sides.
        assertEq(
            guard.digest(safe, safeTxHash, vm.parseJsonBytes32(j, ".intentHash"), vm.parseJsonBytes32(j, ".rules"), uint64(vm.parseJsonUint(j, ".expiry"))),
            vm.parseJsonBytes32(j, ".digest")
        );

        // And the full path: a Safe whose tx hash is the vector's, calling the guard with
        // owner signatures followed by the JS-encoded attestation, is accepted.
        vm.prank(safe);
        guard.setNotary(vm.parseJsonAddress(j, ".notary"));
        vm.mockCall(safe, abi.encodeWithSignature("nonce()"), abi.encode(uint256(1)));
        vm.mockCall(safe, abi.encodeWithSignature("getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256)"), abi.encode(safeTxHash));
        vm.warp(1_800_000_000);
        vm.prank(safe);
        guard.checkTransaction(address(0xBEEF), 1 ether, "", Operation.Call, 0, 0, 0, address(0), payable(address(0)), abi.encodePacked(new bytes(130), tail), address(0));
    }
}
