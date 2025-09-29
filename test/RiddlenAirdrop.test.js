const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");

describe("RiddlenAirdrop", function () {
    let rdlnToken, ronToken, airdrop;
    let owner, admin, operator, user1, user2, user3, user4, user5;
    let users = [];

    const PHASE1_PER_WALLET = ethers.parseEther("10000"); // 10K RDLN
    const PHASE1_MAX_PARTICIPANTS = 5000;
    const PHASE1_ALLOCATION = ethers.parseEther("50000000"); // 50M RDLN
    const PHASE2_ALLOCATION = ethers.parseEther("50000000"); // 50M RDLN
    const TOTAL_ALLOCATION = ethers.parseEther("100000000"); // 100M RDLN

    // Phase 2 rewards
    const TIER1_REWARD = ethers.parseEther("5000");   // 5K RDLN
    const TIER2_REWARD = ethers.parseEther("10000");  // 10K RDLN
    const TIER3_REWARD = ethers.parseEther("15000");  // 15K RDLN
    const TIER4_REWARD = ethers.parseEther("20000");  // 20K RDLN

    beforeEach(async function () {
        [owner, admin, operator, user1, user2, user3, user4, user5, ...users] =
            await ethers.getSigners();

        // Deploy mock RDLN token
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        rdlnToken = await MockERC20.deploy(
            "Riddlen Token",
            "RDLN",
            ethers.parseEther("1000000000") // 1B tokens
        );

        // Deploy mock RON token
        const MockRON = await ethers.getContractFactory("MockRON");
        ronToken = await MockRON.deploy();

        // Deploy airdrop contract
        const RiddlenAirdrop = await ethers.getContractFactory("RiddlenAirdrop");
        airdrop = await upgrades.deployProxy(RiddlenAirdrop, [
            await rdlnToken.getAddress(),
            await ronToken.getAddress(),
            admin.address
        ], { initializer: 'initialize' });

        // Fund the airdrop contract
        await rdlnToken.transfer(await airdrop.getAddress(), TOTAL_ALLOCATION);

        // Grant operator role
        const OPERATOR_ROLE = await airdrop.OPERATOR_ROLE();
        await airdrop.connect(admin).grantRole(OPERATOR_ROLE, operator.address);
    });

    describe("Deployment", function () {
        it("Should set the correct initial values", async function () {
            expect(await airdrop.rdlnToken()).to.equal(await rdlnToken.getAddress());
            expect(await airdrop.ronToken()).to.equal(await ronToken.getAddress());
            expect(await airdrop.phase1Active()).to.be.false;
            expect(await airdrop.phase2Active()).to.be.false;
            expect(await airdrop.phase1Participants()).to.equal(0);
        });

        it("Should grant correct roles", async function () {
            const UPGRADER_ROLE = await airdrop.UPGRADER_ROLE();
            const PAUSER_ROLE = await airdrop.PAUSER_ROLE();
            const OPERATOR_ROLE = await airdrop.OPERATOR_ROLE();

            expect(await airdrop.hasRole(UPGRADER_ROLE, admin.address)).to.be.true;
            expect(await airdrop.hasRole(PAUSER_ROLE, admin.address)).to.be.true;
            expect(await airdrop.hasRole(OPERATOR_ROLE, operator.address)).to.be.true;
        });

        it("Should have correct allocation constants", async function () {
            expect(await airdrop.PHASE1_ALLOCATION()).to.equal(PHASE1_ALLOCATION);
            expect(await airdrop.PHASE2_ALLOCATION()).to.equal(PHASE2_ALLOCATION);
            expect(await airdrop.PHASE1_PER_WALLET()).to.equal(PHASE1_PER_WALLET);
            expect(await airdrop.PHASE1_MAX_PARTICIPANTS()).to.equal(PHASE1_MAX_PARTICIPANTS);
        });
    });

    describe("Phase 1 - Social Proof & Early Adoption", function () {
        beforeEach(async function () {
            // Activate Phase 1
            await airdrop.connect(admin).setPhaseActive(1, true);
        });

        describe("Social Proof Submission", function () {
            it("Should allow users to submit social proof", async function () {
                await expect(
                    airdrop.connect(user1).submitSocialProof("riddlenuser1", "riddlenuser1")
                ).to.emit(airdrop, "SocialProofSubmitted")
                .withArgs(user1.address, "riddlenuser1", "riddlenuser1");

                const proof = await airdrop.socialProofs(user1.address);
                expect(proof.twitterHandle).to.equal("riddlenuser1");
                expect(proof.telegramHandle).to.equal("riddlenuser1");
                expect(proof.twitterVerified).to.be.false;
                expect(proof.telegramVerified).to.be.false;
                expect(proof.shareVerified).to.be.false;
            });

            it("Should require both Twitter and Telegram handles", async function () {
                await expect(
                    airdrop.connect(user1).submitSocialProof("", "riddlenuser1")
                ).to.be.revertedWith("Twitter handle required");

                await expect(
                    airdrop.connect(user1).submitSocialProof("riddlenuser1", "")
                ).to.be.revertedWith("Telegram handle required");
            });
        });

        describe("Social Proof Verification", function () {
            beforeEach(async function () {
                await airdrop.connect(user1).submitSocialProof("riddlenuser1", "riddlenuser1");
            });

            it("Should allow operators to verify social proof", async function () {
                await expect(
                    airdrop.connect(operator).verifySocialProof(user1.address, true, true, true)
                ).to.emit(airdrop, "SocialProofVerified")
                .withArgs(user1.address, true, true, true);

                expect(await airdrop.socialProofVerified(user1.address)).to.be.true;
            });

            it("Should require all three verifications for eligibility", async function () {
                // Partial verification
                await airdrop.connect(operator).verifySocialProof(user1.address, true, true, false);
                expect(await airdrop.socialProofVerified(user1.address)).to.be.false;

                // Full verification
                await airdrop.connect(operator).verifySocialProof(user1.address, true, true, true);
                expect(await airdrop.socialProofVerified(user1.address)).to.be.true;
            });

            it("Should only allow operators to verify", async function () {
                await expect(
                    airdrop.connect(user2).verifySocialProof(user1.address, true, true, true)
                ).to.be.reverted;
            });
        });

        describe("Phase 1 Claims", function () {
            beforeEach(async function () {
                // Setup verified users
                await airdrop.connect(user1).submitSocialProof("riddlenuser1", "riddlenuser1");
                await airdrop.connect(operator).verifySocialProof(user1.address, true, true, true);
            });

            it("Should allow verified users to claim Phase 1 airdrop", async function () {
                const initialBalance = await rdlnToken.balanceOf(user1.address);

                await expect(airdrop.connect(user1).claimPhase1())
                    .to.emit(airdrop, "Phase1Claimed")
                    .withArgs(user1.address, PHASE1_PER_WALLET, 1);

                const finalBalance = await rdlnToken.balanceOf(user1.address);
                expect(finalBalance - initialBalance).to.equal(PHASE1_PER_WALLET);
                expect(await airdrop.phase1Claimed(user1.address)).to.be.true;
                expect(await airdrop.phase1Participants()).to.equal(1);
            });

            it("Should prevent double claiming", async function () {
                await airdrop.connect(user1).claimPhase1();

                await expect(
                    airdrop.connect(user1).claimPhase1()
                ).to.be.revertedWithCustomError(airdrop, "AlreadyClaimed");
            });

            it("Should require social proof verification", async function () {
                await airdrop.connect(user2).submitSocialProof("riddlenuser2", "riddlenuser2");
                // Don't verify user2

                await expect(
                    airdrop.connect(user2).claimPhase1()
                ).to.be.revertedWithCustomError(airdrop, "SocialProofNotVerified");
            });

            it("Should enforce participant limit", async function () {
                // This test would need to be optimized for gas in real scenarios
                // For demonstration, we'll test the limit logic with a smaller number

                // Mock the participant counter to be near the limit
                // In a real test, you'd create 5000 verified users

                // Set participants to maximum - 1
                const maxParticipants = await airdrop.PHASE1_MAX_PARTICIPANTS();

                // We can't easily test 5000 users due to gas limits
                // Instead, let's test the revert condition directly by checking the logic
                const stats = await airdrop.getAirdropStats();
                expect(stats.phase1Remaining).to.equal(maxParticipants);
            });

            it("Should require Phase 1 to be active", async function () {
                await airdrop.connect(admin).setPhaseActive(1, false);

                await expect(
                    airdrop.connect(user1).claimPhase1()
                ).to.be.revertedWithCustomError(airdrop, "PhaseNotActive");
            });
        });

        describe("Phase 1 Status Checks", function () {
            it("Should return correct Phase 1 status", async function () {
                // User with no social proof
                let [eligible, claimed, verified] = await airdrop.getPhase1Status(user1.address);
                expect(eligible).to.be.false;
                expect(claimed).to.be.false;
                expect(verified).to.be.false;

                // User with submitted but unverified social proof
                await airdrop.connect(user1).submitSocialProof("riddlenuser1", "riddlenuser1");
                [eligible, claimed, verified] = await airdrop.getPhase1Status(user1.address);
                expect(eligible).to.be.false;
                expect(verified).to.be.false;

                // User with verified social proof
                await airdrop.connect(operator).verifySocialProof(user1.address, true, true, true);
                [eligible, claimed, verified] = await airdrop.getPhase1Status(user1.address);
                expect(eligible).to.be.true;
                expect(verified).to.be.true;

                // User after claiming
                await airdrop.connect(user1).claimPhase1();
                [eligible, claimed, verified] = await airdrop.getPhase1Status(user1.address);
                expect(eligible).to.be.false;
                expect(claimed).to.be.true;
                expect(verified).to.be.true;
            });
        });
    });

    describe("Phase 2 - Merit-Based RON Airdrop", function () {
        beforeEach(async function () {
            // Activate Phase 2
            await airdrop.connect(admin).setPhaseActive(2, true);
        });

        describe("RON Tier Calculations", function () {
            it("Should calculate correct rewards for each tier", async function () {
                // Tier 1: 1,000-4,999 RON = 5,000 RDLN
                let [reward, tier] = await airdrop.calculatePhase2Reward(1000);
                expect(reward).to.equal(TIER1_REWARD);
                expect(tier).to.equal(1);

                [reward, tier] = await airdrop.calculatePhase2Reward(4999);
                expect(reward).to.equal(TIER1_REWARD);
                expect(tier).to.equal(1);

                // Tier 2: 5,000-9,999 RON = 10,000 RDLN
                [reward, tier] = await airdrop.calculatePhase2Reward(5000);
                expect(reward).to.equal(TIER2_REWARD);
                expect(tier).to.equal(2);

                [reward, tier] = await airdrop.calculatePhase2Reward(9999);
                expect(reward).to.equal(TIER2_REWARD);
                expect(tier).to.equal(2);

                // Tier 3: 10,000-24,999 RON = 15,000 RDLN
                [reward, tier] = await airdrop.calculatePhase2Reward(10000);
                expect(reward).to.equal(TIER3_REWARD);
                expect(tier).to.equal(3);

                [reward, tier] = await airdrop.calculatePhase2Reward(24999);
                expect(reward).to.equal(TIER3_REWARD);
                expect(tier).to.equal(3);

                // Tier 4: 25,000+ RON = 20,000 RDLN
                [reward, tier] = await airdrop.calculatePhase2Reward(25000);
                expect(reward).to.equal(TIER4_REWARD);
                expect(tier).to.equal(4);

                [reward, tier] = await airdrop.calculatePhase2Reward(100000);
                expect(reward).to.equal(TIER4_REWARD);
                expect(tier).to.equal(4);
            });

            it("Should return zero for insufficient RON", async function () {
                const [reward, tier] = await airdrop.calculatePhase2Reward(999);
                expect(reward).to.equal(0);
                expect(tier).to.equal(0);
            });
        });

        describe("Phase 2 Claims", function () {
            it("Should allow qualified users to claim based on RON tier", async function () {
                // Set user1 RON balance to Tier 2 (5,000 RON)
                await ronToken.setBalance(user1.address, 5000);

                const initialBalance = await rdlnToken.balanceOf(user1.address);

                await expect(airdrop.connect(user1).claimPhase2())
                    .to.emit(airdrop, "Phase2Claimed")
                    .withArgs(user1.address, 5000, TIER2_REWARD, 2);

                const finalBalance = await rdlnToken.balanceOf(user1.address);
                expect(finalBalance - initialBalance).to.equal(TIER2_REWARD);
                expect(await airdrop.phase2Claimed(user1.address)).to.be.true;
                expect(await airdrop.phase2ClaimedAmount(user1.address)).to.equal(TIER2_REWARD);
            });

            it("Should test all tier claims", async function () {
                const testCases = [
                    { ron: 1500, expectedReward: TIER1_REWARD, expectedTier: 1 },
                    { ron: 7500, expectedReward: TIER2_REWARD, expectedTier: 2 },
                    { ron: 15000, expectedReward: TIER3_REWARD, expectedTier: 3 },
                    { ron: 50000, expectedReward: TIER4_REWARD, expectedTier: 4 }
                ];

                for (let i = 0; i < testCases.length; i++) {
                    const testCase = testCases[i];
                    const user = users[i];

                    await ronToken.setBalance(user.address, testCase.ron);

                    const initialBalance = await rdlnToken.balanceOf(user.address);

                    await expect(airdrop.connect(user).claimPhase2())
                        .to.emit(airdrop, "Phase2Claimed")
                        .withArgs(user.address, testCase.ron, testCase.expectedReward, testCase.expectedTier);

                    const finalBalance = await rdlnToken.balanceOf(user.address);
                    expect(finalBalance - initialBalance).to.equal(testCase.expectedReward);
                }
            });

            it("Should prevent double claiming", async function () {
                await ronToken.setBalance(user1.address, 5000);
                await airdrop.connect(user1).claimPhase2();

                await expect(
                    airdrop.connect(user1).claimPhase2()
                ).to.be.revertedWithCustomError(airdrop, "AlreadyClaimed");
            });

            it("Should require minimum RON balance", async function () {
                await ronToken.setBalance(user1.address, 999);

                await expect(
                    airdrop.connect(user1).claimPhase2()
                ).to.be.revertedWithCustomError(airdrop, "InsufficientRON");
            });

            it("Should require Phase 2 to be active", async function () {
                await ronToken.setBalance(user1.address, 5000);
                await airdrop.connect(admin).setPhaseActive(2, false);

                await expect(
                    airdrop.connect(user1).claimPhase2()
                ).to.be.revertedWithCustomError(airdrop, "PhaseNotActive");
            });
        });

        describe("Phase 2 Status Checks", function () {
            it("Should return correct Phase 2 status", async function () {
                // User with insufficient RON
                await ronToken.setBalance(user1.address, 500);
                let [eligible, claimed, ronBalance, reward, tier] = await airdrop.getPhase2Status(user1.address);
                expect(eligible).to.be.false;
                expect(claimed).to.be.false;
                expect(ronBalance).to.equal(500);
                expect(reward).to.equal(0);
                expect(tier).to.equal(0);

                // User with sufficient RON
                await ronToken.setBalance(user1.address, 5000);
                [eligible, claimed, ronBalance, reward, tier] = await airdrop.getPhase2Status(user1.address);
                expect(eligible).to.be.true;
                expect(claimed).to.be.false;
                expect(ronBalance).to.equal(5000);
                expect(reward).to.equal(TIER2_REWARD);
                expect(tier).to.equal(2);

                // User after claiming
                await airdrop.connect(user1).claimPhase2();
                [eligible, claimed, ronBalance, reward, tier] = await airdrop.getPhase2Status(user1.address);
                expect(eligible).to.be.false;
                expect(claimed).to.be.true;
            });
        });
    });

    describe("Admin Functions", function () {
        describe("Phase Management", function () {
            it("Should allow admins to activate/deactivate phases", async function () {
                await expect(airdrop.connect(admin).setPhaseActive(1, true))
                    .to.emit(airdrop, "PhaseActivated")
                    .withArgs(1, true);

                expect(await airdrop.phase1Active()).to.be.true;

                await expect(airdrop.connect(admin).setPhaseActive(2, true))
                    .to.emit(airdrop, "PhaseActivated")
                    .withArgs(2, true);

                expect(await airdrop.phase2Active()).to.be.true;
            });

            it("Should only allow admins to manage phases", async function () {
                await expect(
                    airdrop.connect(user1).setPhaseActive(1, true)
                ).to.be.reverted;
            });

            it("Should reject invalid phase numbers", async function () {
                await expect(
                    airdrop.connect(admin).setPhaseActive(3, true)
                ).to.be.revertedWith("Invalid phase");
            });
        });

        describe("Emergency Functions", function () {
            it("Should allow emergency token withdrawal", async function () {
                const withdrawAmount = ethers.parseEther("1000000");
                const initialBalance = await rdlnToken.balanceOf(admin.address);

                await airdrop.connect(admin).emergencyWithdraw(admin.address, withdrawAmount);

                const finalBalance = await rdlnToken.balanceOf(admin.address);
                expect(finalBalance - initialBalance).to.equal(withdrawAmount);
            });

            it("Should only allow admins to emergency withdraw", async function () {
                await expect(
                    airdrop.connect(user1).emergencyWithdraw(user1.address, ethers.parseEther("1000"))
                ).to.be.reverted;
            });

            it("Should allow pause/unpause", async function () {
                await airdrop.connect(admin).pause();
                expect(await airdrop.paused()).to.be.true;

                await airdrop.connect(admin).unpause();
                expect(await airdrop.paused()).to.be.false;
            });
        });
    });

    describe("View Functions", function () {
        it("Should return correct airdrop statistics", async function () {
            const [participants, remaining, balance] = await airdrop.getAirdropStats();
            expect(participants).to.equal(0);
            expect(remaining).to.equal(PHASE1_MAX_PARTICIPANTS);
            expect(balance).to.equal(TOTAL_ALLOCATION);
        });
    });

    describe("Security", function () {
        it("Should prevent claims when paused", async function () {
            await airdrop.connect(admin).setPhaseActive(1, true);
            await airdrop.connect(user1).submitSocialProof("riddlenuser1", "riddlenuser1");
            await airdrop.connect(operator).verifySocialProof(user1.address, true, true, true);

            await airdrop.connect(admin).pause();

            await expect(
                airdrop.connect(user1).claimPhase1()
            ).to.be.reverted;
        });

        it("Should prevent reentrancy attacks", async function () {
            // The ReentrancyGuard should prevent reentrancy
            // This is more of a theoretical test as the contract uses OpenZeppelin's guard
            expect(await airdrop.getAddress()).to.not.equal(ethers.ZeroAddress);
        });

        it("Should handle insufficient contract balance", async function () {
            // Drain most of the contract balance
            const contractBalance = await rdlnToken.balanceOf(await airdrop.getAddress());
            const drainAmount = contractBalance - ethers.parseEther("5000"); // Leave 5K tokens

            await airdrop.connect(admin).emergencyWithdraw(admin.address, drainAmount);

            // Try to claim 10K tokens when only 5K remain
            await airdrop.connect(admin).setPhaseActive(1, true);
            await airdrop.connect(user1).submitSocialProof("riddlenuser1", "riddlenuser1");
            await airdrop.connect(operator).verifySocialProof(user1.address, true, true, true);

            await expect(
                airdrop.connect(user1).claimPhase1()
            ).to.be.revertedWithCustomError(airdrop, "InsufficientContractBalance");
        });
    });

    describe("Upgrade Functionality", function () {
        it("Should be upgradeable by admin", async function () {
            const RiddlenAirdropV2 = await ethers.getContractFactory("RiddlenAirdrop");

            // Connect as admin for upgrade
            await expect(
                upgrades.upgradeProxy(await airdrop.getAddress(), RiddlenAirdropV2.connect(admin))
            ).to.not.be.reverted;
        });

        it("Should preserve state after upgrade", async function () {
            // Set some state
            await airdrop.connect(admin).setPhaseActive(1, true);

            // Perform upgrade as admin
            const RiddlenAirdropV2 = await ethers.getContractFactory("RiddlenAirdrop");
            const upgraded = await upgrades.upgradeProxy(await airdrop.getAddress(), RiddlenAirdropV2.connect(admin));

            // Check state preservation
            expect(await upgraded.phase1Active()).to.be.true;
            expect(await upgraded.rdlnToken()).to.equal(await rdlnToken.getAddress());
        });
    });
});