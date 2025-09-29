// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IRON.sol";

/**
 * @title RiddlenAirdrop
 * @dev Two-phase airdrop system for Riddlen Protocol v5.2
 *
 * Phase 1: Early Adoption Incentive (50M RDLN)
 * - 10,000 RDLN per wallet
 * - First 5,000 wallets only
 * - Social proof requirements
 * - One-time claim per wallet
 *
 * Phase 2: Merit-Based RON Airdrop (50M RDLN)
 * - Tiered rewards based on RON reputation
 * - 1,000 RON minimum requirement
 * - Performance-based allocation
 * - Single claim per qualified wallet
 */
contract RiddlenAirdrop is
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardUpgradeable,
    UUPSUpgradeable
{
    // =============================================================
    //                        CONSTANTS
    // =============================================================

    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant COMPLIANCE_ROLE = keccak256("COMPLIANCE_ROLE");

    // Phase 1 constants
    uint256 public constant PHASE1_ALLOCATION = 50_000_000 * 1e18; // 50M RDLN
    uint256 public constant PHASE1_PER_WALLET = 10_000 * 1e18;     // 10K RDLN per wallet
    uint256 public constant PHASE1_MAX_PARTICIPANTS = 5_000;        // First 5K wallets

    // Phase 2 constants
    uint256 public constant PHASE2_ALLOCATION = 50_000_000 * 1e18; // 50M RDLN
    uint256 public constant RON_MINIMUM_THRESHOLD = 1_000;          // 1K RON minimum

    // Phase 2 tier thresholds and rewards
    uint256 public constant TIER1_THRESHOLD = 1_000;   // 1K-4.999K RON
    uint256 public constant TIER2_THRESHOLD = 5_000;   // 5K-9.999K RON
    uint256 public constant TIER3_THRESHOLD = 10_000;  // 10K-24.999K RON
    uint256 public constant TIER4_THRESHOLD = 25_000;  // 25K+ RON

    uint256 public constant TIER1_REWARD = 5_000 * 1e18;   // 5K RDLN
    uint256 public constant TIER2_REWARD = 10_000 * 1e18;  // 10K RDLN
    uint256 public constant TIER3_REWARD = 15_000 * 1e18;  // 15K RDLN
    uint256 public constant TIER4_REWARD = 20_000 * 1e18;  // 20K RDLN

    // =============================================================
    //                        STORAGE
    // =============================================================

    IERC20 public rdlnToken;
    IRON public ronToken;

    // Phase 1 state
    bool public phase1Active;
    uint256 public phase1Participants;
    mapping(address => bool) public phase1Claimed;
    mapping(address => bool) public socialProofVerified;

    // Phase 2 state
    bool public phase2Active;
    mapping(address => bool) public phase2Claimed;
    mapping(address => uint256) public phase2ClaimedAmount;

    // Social proof tracking
    mapping(address => SocialProof) public socialProofs;

    struct SocialProof {
        bool twitterVerified;
        bool telegramVerified;
        bool shareVerified;
        string twitterHandle;
        string telegramHandle;
        uint256 verificationTimestamp;
    }

    // =============================================================
    //                        EVENTS
    // =============================================================

    event Phase1Claimed(
        address indexed user,
        uint256 amount,
        uint256 participantNumber
    );

    event Phase2Claimed(
        address indexed user,
        uint256 ronBalance,
        uint256 amount,
        uint8 tier
    );

    event SocialProofSubmitted(
        address indexed user,
        string twitterHandle,
        string telegramHandle
    );

    event SocialProofVerified(
        address indexed user,
        bool twitterVerified,
        bool telegramVerified,
        bool shareVerified
    );

    event PhaseActivated(uint8 phase, bool active);

    // =============================================================
    //                        ERRORS
    // =============================================================

    error PhaseNotActive();
    error AlreadyClaimed();
    error Phase1Full();
    error SocialProofNotVerified();
    error InsufficientRON();
    error InvalidRONBalance();
    error InsufficientContractBalance();
    error InvalidSocialProof();
    error UnauthorizedUpgrade();

    // =============================================================
    //                        INITIALIZER
    // =============================================================

    function initialize(
        address _rdlnToken,
        address _ronToken,
        address _admin
    ) public initializer {
        __AccessControl_init();
        __Pausable_init();
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();

        require(_rdlnToken != address(0), "Invalid RDLN address");
        require(_ronToken != address(0), "Invalid RON address");
        require(_admin != address(0), "Invalid admin address");

        rdlnToken = IERC20(_rdlnToken);
        ronToken = IRON(_ronToken);

        _grantRole(DEFAULT_ADMIN_ROLE, _admin);
        _grantRole(UPGRADER_ROLE, _admin);
        _grantRole(PAUSER_ROLE, _admin);
        _grantRole(OPERATOR_ROLE, _admin);
        _grantRole(COMPLIANCE_ROLE, _admin);
    }

    // =============================================================
    //                        PHASE 1 FUNCTIONS
    // =============================================================

    /**
     * @dev Submit social proof for Phase 1 verification
     * @param _twitterHandle Twitter username (without @)
     * @param _telegramHandle Telegram username (without @)
     */
    function submitSocialProof(
        string calldata _twitterHandle,
        string calldata _telegramHandle
    ) external whenNotPaused {
        require(bytes(_twitterHandle).length > 0, "Twitter handle required");
        require(bytes(_telegramHandle).length > 0, "Telegram handle required");

        socialProofs[msg.sender] = SocialProof({
            twitterVerified: false,
            telegramVerified: false,
            shareVerified: false,
            twitterHandle: _twitterHandle,
            telegramHandle: _telegramHandle,
            verificationTimestamp: 0
        });

        emit SocialProofSubmitted(msg.sender, _twitterHandle, _telegramHandle);
    }

    /**
     * @dev Verify social proof for a user (operator only)
     * @param _user User address to verify
     * @param _twitterVerified Twitter follow verification
     * @param _telegramVerified Telegram join verification
     * @param _shareVerified Share post verification
     */
    function verifySocialProof(
        address _user,
        bool _twitterVerified,
        bool _telegramVerified,
        bool _shareVerified
    ) external onlyRole(OPERATOR_ROLE) {
        require(_user != address(0), "Invalid user address");

        SocialProof storage proof = socialProofs[_user];
        require(bytes(proof.twitterHandle).length > 0, "No social proof submitted");

        proof.twitterVerified = _twitterVerified;
        proof.telegramVerified = _telegramVerified;
        proof.shareVerified = _shareVerified;
        proof.verificationTimestamp = block.timestamp;

        // Mark as verified if all requirements met
        if (_twitterVerified && _telegramVerified && _shareVerified) {
            socialProofVerified[_user] = true;
        }

        emit SocialProofVerified(_user, _twitterVerified, _telegramVerified, _shareVerified);
    }

    /**
     * @dev Claim Phase 1 airdrop (10,000 RDLN)
     * Requirements:
     * - Phase 1 must be active
     * - Social proof must be verified
     * - Must be within first 5,000 participants
     * - One claim per wallet
     */
    function claimPhase1() external nonReentrant whenNotPaused {
        if (!phase1Active) revert PhaseNotActive();
        if (phase1Claimed[msg.sender]) revert AlreadyClaimed();
        if (phase1Participants >= PHASE1_MAX_PARTICIPANTS) revert Phase1Full();
        if (!socialProofVerified[msg.sender]) revert SocialProofNotVerified();

        // Check contract has sufficient balance
        if (rdlnToken.balanceOf(address(this)) < PHASE1_PER_WALLET) {
            revert InsufficientContractBalance();
        }

        // Mark as claimed and increment counter
        phase1Claimed[msg.sender] = true;
        phase1Participants++;

        // Transfer tokens
        require(
            rdlnToken.transfer(msg.sender, PHASE1_PER_WALLET),
            "Transfer failed"
        );

        emit Phase1Claimed(msg.sender, PHASE1_PER_WALLET, phase1Participants);
    }

    // =============================================================
    //                        PHASE 2 FUNCTIONS
    // =============================================================

    /**
     * @dev Calculate Phase 2 reward based on RON balance
     * @param _ronBalance User's RON token balance
     * @return reward RDLN reward amount
     * @return tier Tier level (1-4)
     */
    function calculatePhase2Reward(uint256 _ronBalance)
        public
        pure
        returns (uint256 reward, uint8 tier)
    {
        if (_ronBalance < RON_MINIMUM_THRESHOLD) {
            return (0, 0);
        } else if (_ronBalance < TIER2_THRESHOLD) {
            return (TIER1_REWARD, 1);
        } else if (_ronBalance < TIER3_THRESHOLD) {
            return (TIER2_REWARD, 2);
        } else if (_ronBalance < TIER4_THRESHOLD) {
            return (TIER3_REWARD, 3);
        } else {
            return (TIER4_REWARD, 4);
        }
    }

    /**
     * @dev Claim Phase 2 merit-based airdrop
     * Requirements:
     * - Phase 2 must be active
     * - Must have minimum 1,000 RON
     * - One claim per wallet
     * - Reward based on RON tier
     */
    function claimPhase2() external nonReentrant whenNotPaused {
        if (!phase2Active) revert PhaseNotActive();
        if (phase2Claimed[msg.sender]) revert AlreadyClaimed();

        // Get user's RON balance
        uint256 ronBalance = ronToken.balanceOf(msg.sender);
        if (ronBalance < RON_MINIMUM_THRESHOLD) revert InsufficientRON();

        // Calculate reward and tier
        (uint256 reward, uint8 tier) = calculatePhase2Reward(ronBalance);
        if (reward == 0) revert InvalidRONBalance();

        // Check contract has sufficient balance
        if (rdlnToken.balanceOf(address(this)) < reward) {
            revert InsufficientContractBalance();
        }

        // Mark as claimed
        phase2Claimed[msg.sender] = true;
        phase2ClaimedAmount[msg.sender] = reward;

        // Transfer tokens
        require(
            rdlnToken.transfer(msg.sender, reward),
            "Transfer failed"
        );

        emit Phase2Claimed(msg.sender, ronBalance, reward, tier);
    }

    // =============================================================
    //                        ADMIN FUNCTIONS
    // =============================================================

    /**
     * @dev Activate/deactivate airdrop phases
     * @param _phase Phase number (1 or 2)
     * @param _active Whether to activate or deactivate
     */
    function setPhaseActive(uint8 _phase, bool _active) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_phase == 1 || _phase == 2, "Invalid phase");

        if (_phase == 1) {
            phase1Active = _active;
        } else {
            phase2Active = _active;
        }

        emit PhaseActivated(_phase, _active);
    }

    /**
     * @dev Emergency withdrawal of remaining tokens
     * @param _to Recipient address
     * @param _amount Amount to withdraw
     */
    function emergencyWithdraw(
        address _to,
        uint256 _amount
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_to != address(0), "Invalid recipient");
        require(rdlnToken.balanceOf(address(this)) >= _amount, "Insufficient balance");

        require(rdlnToken.transfer(_to, _amount), "Transfer failed");
    }

    /**
     * @dev Pause/unpause contract
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // =============================================================
    //                        VIEW FUNCTIONS
    // =============================================================

    /**
     * @dev Get user's Phase 1 eligibility status
     * @param _user User address to check
     * @return eligible Whether user is eligible
     * @return claimed Whether user has already claimed
     * @return verified Whether social proof is verified
     */
    function getPhase1Status(address _user)
        external
        view
        returns (bool eligible, bool claimed, bool verified)
    {
        claimed = phase1Claimed[_user];
        verified = socialProofVerified[_user];
        eligible = phase1Active &&
                  !claimed &&
                  verified &&
                  phase1Participants < PHASE1_MAX_PARTICIPANTS;
    }

    /**
     * @dev Get user's Phase 2 eligibility and reward info
     * @param _user User address to check
     * @return eligible Whether user is eligible
     * @return claimed Whether user has already claimed
     * @return ronBalance User's current RON balance
     * @return reward Potential RDLN reward
     * @return tier RON tier level
     */
    function getPhase2Status(address _user)
        external
        view
        returns (
            bool eligible,
            bool claimed,
            uint256 ronBalance,
            uint256 reward,
            uint8 tier
        )
    {
        claimed = phase2Claimed[_user];
        ronBalance = ronToken.balanceOf(_user);
        (reward, tier) = calculatePhase2Reward(ronBalance);

        eligible = phase2Active &&
                  !claimed &&
                  ronBalance >= RON_MINIMUM_THRESHOLD;
    }

    /**
     * @dev Get airdrop statistics
     * @return phase1Participants_ Current Phase 1 participant count
     * @return phase1Remaining Remaining Phase 1 slots
     * @return contractBalance Current RDLN balance in contract
     */
    function getAirdropStats()
        external
        view
        returns (
            uint256 phase1Participants_,
            uint256 phase1Remaining,
            uint256 contractBalance
        )
    {
        phase1Participants_ = phase1Participants;
        phase1Remaining = PHASE1_MAX_PARTICIPANTS > phase1Participants
            ? PHASE1_MAX_PARTICIPANTS - phase1Participants
            : 0;
        contractBalance = rdlnToken.balanceOf(address(this));
    }

    // =============================================================
    //                        UPGRADE AUTHORIZATION
    // =============================================================

    function _authorizeUpgrade(address newImplementation)
        internal
        view
        override
        onlyRole(UPGRADER_ROLE)
    {
        // Additional upgrade validation
        if (newImplementation == address(0)) revert UnauthorizedUpgrade();

        // Add compliance checks if needed
        // emit UpgradeAuthorized(newImplementation, msg.sender);
    }
}