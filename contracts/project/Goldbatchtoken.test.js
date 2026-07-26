const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("GoldBatchToken", function () {
  let token, admin, whitelisted, notWhitelisted, other;
  const URI = "https://yourapp.example/metadata/{id}.json";

  beforeEach(async () => {
    [admin, whitelisted, notWhitelisted, other] = await ethers.getSigners();
    const Token = await ethers.getContractFactory("GoldBatchToken");
    token = await Token.deploy(URI);
    await token.setWhitelist(whitelisted.address, true);
  });

  describe("deployment", () => {
    it("grants the deployer all roles and whitelists them", async () => {
      const KYC_ADMIN_ROLE = await token.KYC_ADMIN_ROLE();
      const ISSUER_ROLE = await token.ISSUER_ROLE();
      expect(await token.hasRole(KYC_ADMIN_ROLE, admin.address)).to.equal(true);
      expect(await token.hasRole(ISSUER_ROLE, admin.address)).to.equal(true);
      expect(await token.isWhitelisted(admin.address)).to.equal(true);
    });
  });

  describe("whitelist", () => {
    it("only KYC_ADMIN_ROLE can whitelist", async () => {
      await expect(
        token.connect(notWhitelisted).setWhitelist(other.address, true)
      ).to.be.reverted;
    });

    it("rejects whitelisting the zero address", async () => {
      await expect(
        token.setWhitelist(ethers.ZeroAddress, true)
      ).to.be.revertedWith("zero address");
    });

    it("emits WhitelistUpdated", async () => {
      await expect(token.setWhitelist(other.address, true))
        .to.emit(token, "WhitelistUpdated")
        .withArgs(other.address, true);
    });
  });

  describe("batch creation", () => {
    it("only ISSUER_ROLE can create a batch", async () => {
      await expect(
        token.connect(notWhitelisted).createBatch(1000, "ipfs://ref")
      ).to.be.reverted;
    });

    it("rejects a zero max supply", async () => {
      await expect(token.createBatch(0, "ipfs://ref")).to.be.revertedWith(
        "max supply must be positive"
      );
    });

    it("assigns sequential ids and emits BatchCreated", async () => {
      await expect(token.createBatch(1000, "ipfs://ref-1"))
        .to.emit(token, "BatchCreated")
        .withArgs(0, 1000, "ipfs://ref-1");
      await expect(token.createBatch(500, "ipfs://ref-2"))
        .to.emit(token, "BatchCreated")
        .withArgs(1, 500, "ipfs://ref-2");
    });
  });

  describe("minting", () => {
    let batchId;
    beforeEach(async () => {
      await token.createBatch(1000, "ipfs://ref-1");
      batchId = 0;
    });

    it("mints only to whitelisted addresses", async () => {
      await expect(
        token.mint(notWhitelisted.address, batchId, 10)
      ).to.be.revertedWith("recipient not KYC-approved");

      await token.mint(whitelisted.address, batchId, 10);
      expect(await token.balanceOf(whitelisted.address, batchId)).to.equal(10);
    });

    it("rejects minting against a batch that doesn't exist", async () => {
      await expect(token.mint(whitelisted.address, 999, 1)).to.be.revertedWith(
        "batch does not exist"
      );
    });

    it("rejects a zero mint amount", async () => {
      await expect(
        token.mint(whitelisted.address, batchId, 0)
      ).to.be.revertedWith("amount must be positive");
    });

    it("enforces the fixed per-batch max supply", async () => {
      await expect(
        token.mint(whitelisted.address, batchId, 1001)
      ).to.be.revertedWith("exceeds batch supply");
    });

    it("allows minting up to exactly the max supply, across multiple calls", async () => {
      await token.mint(whitelisted.address, batchId, 600);
      await token.mint(whitelisted.address, batchId, 400);
      expect(await token.balanceOf(whitelisted.address, batchId)).to.equal(1000);
      await expect(
        token.mint(whitelisted.address, batchId, 1)
      ).to.be.revertedWith("exceeds batch supply");
    });

    it("only ISSUER_ROLE can mint", async () => {
      await expect(
        token.connect(whitelisted).mint(whitelisted.address, batchId, 10)
      ).to.be.reverted;
    });

    it("tracks remaining supply correctly", async () => {
      await token.mint(whitelisted.address, batchId, 300);
      expect(await token.remainingSupply(batchId)).to.equal(700);
    });
  });

  describe("transfers", () => {
    let batchId;
    beforeEach(async () => {
      await token.createBatch(1000, "ipfs://ref-1");
      batchId = 0;
      await token.mint(whitelisted.address, batchId, 100);
    });

    it("blocks transfers to non-whitelisted addresses", async () => {
      await expect(
        token
          .connect(whitelisted)
          .safeTransferFrom(whitelisted.address, notWhitelisted.address, batchId, 1, "0x")
      ).to.be.revertedWith("recipient not KYC-approved");
    });

    it("allows transfers between two whitelisted holders", async () => {
      await token.setWhitelist(notWhitelisted.address, true);
      await token
        .connect(whitelisted)
        .safeTransferFrom(whitelisted.address, notWhitelisted.address, batchId, 10, "0x");
      expect(await token.balanceOf(notWhitelisted.address, batchId)).to.equal(10);
      expect(await token.balanceOf(whitelisted.address, batchId)).to.equal(90);
    });

    it("blocks transfers from an address that has since been de-whitelisted", async () => {
      await token.setWhitelist(whitelisted.address, false);
      await expect(
        token
          .connect(whitelisted)
          .safeTransferFrom(whitelisted.address, admin.address, batchId, 1, "0x")
      ).to.be.revertedWith("sender not KYC-approved");
    });
  });
});