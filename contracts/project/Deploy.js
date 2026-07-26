const hre = require("hardhat");

async function main() {
  const uri = "https://yourapp.example/metadata/{id}.json";

  const Token = await hre.ethers.getContractFactory("GoldBatchToken");
  const token = await Token.deploy(uri);
  await token.waitForDeployment();
  const address = await token.getAddress();
  console.log("GoldBatchToken deployed to:", address);

  // Register an initial demo batch so the contract is demo-ready right away.
  const tx = await token.createBatch(
    hre.ethers.parseUnits("10000", 0),
    "ipfs://batch-0-assay-report"
  );
  await tx.wait();
  console.log("Batch 0 created (max supply 10,000 grams)");

  console.log("\nNext steps:");
  console.log(`  npx hardhat verify --network sepolia ${address} "${uri}"`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});