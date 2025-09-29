const { ethers, upgrades } = require("hardhat");

async function main() {
    console.log("🚀 Deploying Riddlen Airdrop Contract v5.2...");

    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);
    console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)));

    // Configuration
    const config = {
        // Replace with actual deployed contract addresses
        rdlnToken: process.env.RDLN_TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000",
        ronToken: process.env.RON_TOKEN_ADDRESS || "0x0000000000000000000000000000000000000000",
        admin: process.env.ADMIN_ADDRESS || deployer.address,
    };

    console.log("Configuration:");
    console.log("- RDLN Token:", config.rdlnToken);
    console.log("- RON Token:", config.ronToken);
    console.log("- Admin:", config.admin);

    // Validate addresses
    if (config.rdlnToken === "0x0000000000000000000000000000000000000000") {
        console.error("❌ Please set RDLN_TOKEN_ADDRESS environment variable");
        process.exit(1);
    }

    if (config.ronToken === "0x0000000000000000000000000000000000000000") {
        console.error("❌ Please set RON_TOKEN_ADDRESS environment variable");
        process.exit(1);
    }

    // Deploy the airdrop contract
    console.log("\n📋 Deploying RiddlenAirdrop...");

    const RiddlenAirdrop = await ethers.getContractFactory("RiddlenAirdrop");

    const airdrop = await upgrades.deployProxy(RiddlenAirdrop, [
        config.rdlnToken,
        config.ronToken,
        config.admin
    ], {
        initializer: 'initialize',
        kind: 'uups'
    });

    await airdrop.waitForDeployment();
    const airdropAddress = await airdrop.getAddress();

    console.log("✅ RiddlenAirdrop deployed to:", airdropAddress);

    // Verify deployment
    console.log("\n🔍 Verifying deployment...");

    const rdlnTokenAddr = await airdrop.rdlnToken();
    const ronTokenAddr = await airdrop.ronToken();
    const phase1Active = await airdrop.phase1Active();
    const phase2Active = await airdrop.phase2Active();

    console.log("- RDLN Token Address:", rdlnTokenAddr);
    console.log("- RON Token Address:", ronTokenAddr);
    console.log("- Phase 1 Active:", phase1Active);
    console.log("- Phase 2 Active:", phase2Active);

    // Display airdrop constants
    console.log("\n📊 Airdrop Configuration:");
    const phase1Allocation = await airdrop.PHASE1_ALLOCATION();
    const phase2Allocation = await airdrop.PHASE2_ALLOCATION();
    const phase1PerWallet = await airdrop.PHASE1_PER_WALLET();
    const maxParticipants = await airdrop.PHASE1_MAX_PARTICIPANTS();

    console.log("- Phase 1 Allocation:", ethers.formatEther(phase1Allocation), "RDLN");
    console.log("- Phase 2 Allocation:", ethers.formatEther(phase2Allocation), "RDLN");
    console.log("- Phase 1 Per Wallet:", ethers.formatEther(phase1PerWallet), "RDLN");
    console.log("- Max Phase 1 Participants:", maxParticipants.toString());

    // Display tier rewards
    console.log("\n🏆 Phase 2 Tier Rewards:");
    const tier1Reward = await airdrop.TIER1_REWARD();
    const tier2Reward = await airdrop.TIER2_REWARD();
    const tier3Reward = await airdrop.TIER3_REWARD();
    const tier4Reward = await airdrop.TIER4_REWARD();

    console.log("- Tier 1 (1K-5K RON):", ethers.formatEther(tier1Reward), "RDLN");
    console.log("- Tier 2 (5K-10K RON):", ethers.formatEther(tier2Reward), "RDLN");
    console.log("- Tier 3 (10K-25K RON):", ethers.formatEther(tier3Reward), "RDLN");
    console.log("- Tier 4 (25K+ RON):", ethers.formatEther(tier4Reward), "RDLN");

    // Check roles
    console.log("\n🔐 Role Configuration:");
    const upgraderRole = await airdrop.UPGRADER_ROLE();
    const pauserRole = await airdrop.PAUSER_ROLE();
    const operatorRole = await airdrop.OPERATOR_ROLE();
    const hasUpgraderRole = await airdrop.hasRole(upgraderRole, config.admin);

    console.log("- Admin has UPGRADER_ROLE:", hasUpgraderRole);
    console.log("- Upgrader Role Hash:", upgraderRole);
    console.log("- Pauser Role Hash:", pauserRole);
    console.log("- Operator Role Hash:", operatorRole);

    // Deployment summary
    console.log("\n📋 Deployment Summary:");
    console.log("================================");
    console.log("Network:", (await ethers.provider.getNetwork()).name);
    console.log("Chain ID:", (await ethers.provider.getNetwork()).chainId);
    console.log("Deployer:", deployer.address);
    console.log("Admin:", config.admin);
    console.log("RiddlenAirdrop:", airdropAddress);
    console.log("================================");

    // Next steps
    console.log("\n📝 Next Steps:");
    console.log("1. Fund the airdrop contract with 100M RDLN tokens");
    console.log("2. Grant OPERATOR_ROLE to social proof verification addresses");
    console.log("3. Activate Phase 1 when ready to begin early adoption airdrop");
    console.log("4. Set up social proof verification systems (Twitter/Telegram)");
    console.log("5. Activate Phase 2 when RON reputation system is operational");

    console.log("\n🔧 Funding Command:");
    console.log(`rdlnToken.transfer("${airdropAddress}", ethers.parseEther("100000000"));`);

    console.log("\n🔧 Operator Role Command:");
    console.log(`airdrop.grantRole("${operatorRole}", "OPERATOR_ADDRESS");`);

    console.log("\n🔧 Activation Commands:");
    console.log(`airdrop.setPhaseActive(1, true); // Activate Phase 1`);
    console.log(`airdrop.setPhaseActive(2, true); // Activate Phase 2`);

    console.log("\n✅ Airdrop contract deployment completed!");

    return {
        airdrop: airdropAddress,
        rdlnToken: config.rdlnToken,
        ronToken: config.ronToken,
        admin: config.admin
    };
}

// Handle script execution
if (require.main === module) {
    main()
        .then((result) => {
            console.log("\n🎉 Deployment successful!");
            console.log("Contract addresses:", result);
            process.exit(0);
        })
        .catch((error) => {
            console.error("\n❌ Deployment failed:");
            console.error(error);
            process.exit(1);
        });
}

module.exports = main;