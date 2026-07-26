// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title GoldBatchToken
/// @notice ERC-1155 fractional ownership token for tokenized gold batches.
/// Each `id` represents a distinct custody event (e.g. a vault deposit),
/// with its own fixed max supply. Every mint and transfer, for every id,
/// is gated by a KYC whitelist so only approved addresses can ever hold
/// or receive a fraction.
contract GoldBatchToken is ERC1155, AccessControl {
    bytes32 public constant KYC_ADMIN_ROLE = keccak256("KYC_ADMIN_ROLE");
    bytes32 public constant ISSUER_ROLE = keccak256("ISSUER_ROLE");

    mapping(address => bool) public isWhitelisted;

    struct BatchInfo {
        uint256 maxSupply;
        uint256 mintedSupply;
        string custodyReference; // hash/IPFS pointer to vault or assay document
        bool exists;
    }
    mapping(uint256 => BatchInfo) public batches;
    uint256 public nextBatchId;

    event WhitelistUpdated(address indexed account, bool approved);
    event BatchCreated(uint256 indexed id, uint256 maxSupply, string custodyReference);
    event BatchMinted(uint256 indexed id, address indexed to, uint256 amount);

    constructor(string memory uri_) ERC1155(uri_) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(KYC_ADMIN_ROLE, msg.sender);
        _grantRole(ISSUER_ROLE, msg.sender);
        isWhitelisted[msg.sender] = true;
    }

    /// @notice Approve or revoke an address's KYC/whitelist status.
    function setWhitelist(address account, bool approved) external onlyRole(KYC_ADMIN_ROLE) {
        require(account != address(0), "zero address");
        isWhitelisted[account] = approved;
        emit WhitelistUpdated(account, approved);
    }

    /// @notice Register a new batch (custody event) with a fixed max supply,
    /// before anything can be minted against it.
    function createBatch(uint256 maxSupply, string calldata custodyReference)
        external
        onlyRole(ISSUER_ROLE)
        returns (uint256 id)
    {
        require(maxSupply > 0, "max supply must be positive");
        id = nextBatchId++;
        batches[id] = BatchInfo({
            maxSupply: maxSupply,
            mintedSupply: 0,
            custodyReference: custodyReference,
            exists: true
        });
        emit BatchCreated(id, maxSupply, custodyReference);
    }

    /// @notice Mint fractions of an existing batch to a whitelisted address.
    function mint(address to, uint256 id, uint256 amount) external onlyRole(ISSUER_ROLE) {
        BatchInfo storage batch = batches[id];
        require(batch.exists, "batch does not exist");
        require(isWhitelisted[to], "recipient not KYC-approved");
        require(amount > 0, "amount must be positive");
        require(batch.mintedSupply + amount <= batch.maxSupply, "exceeds batch supply");

        batch.mintedSupply += amount;
        _mint(to, id, amount, "");
        emit BatchMinted(id, to, amount);
    }

    /// @notice Remaining mintable supply for a batch.
    function remainingSupply(uint256 id) external view returns (uint256) {
        BatchInfo storage batch = batches[id];
        require(batch.exists, "batch does not exist");
        return batch.maxSupply - batch.mintedSupply;
    }

    /// @dev Enforce the whitelist on every transfer, including mint (from
    /// address(0)) and burn (to address(0)), across all ids in the batch.
    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override
    {
        if (from != address(0)) {
            require(isWhitelisted[from], "sender not KYC-approved");
        }
        if (to != address(0)) {
            require(isWhitelisted[to], "recipient not KYC-approved");
        }
        super._update(from, to, ids, values);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
