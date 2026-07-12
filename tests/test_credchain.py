"""
CredChain Contract Tests
========================
Test scenarios for the CredChain Intelligent Contract.

These tests document expected behavior and can be adapted to run with the
GenLayer test runner or as standalone unit tests with mocked gl.* objects.

Test Coverage:
  1. Happy path — full register → stake → request → execute → VERIFIED flow
  2. Blacklist / fraud detection — fraud_detected=True slashes bond + blacklists
  3. Invalid request_id — execute_verification raises on unknown request_id
  4. Zero stake guard — execute_verification raises if candidate has no stake
  5. Double-claim guard — second execute on same DONE request is rejected
  6. Unregistered candidate — request_verification raises for unknown address
  7. Blacklisted request — cannot request verification for blacklisted candidate
"""

import json
import sys

# ============================================================
# Mock GenLayer primitives for unit testing without GenVM
# ============================================================

class MockAddress:
    def __init__(self, addr: str):
        self._addr = addr
    def __str__(self):
        return self._addr

class MockMessage:
    def __init__(self, sender: str, timestamp: int = 1720000000):
        self.sender_address = MockAddress(sender)
        self.timestamp = timestamp

class MockNondet:
    """Simulates gl.nondet.web.render and gl.nondet.exec_prompt for testing."""

    def __init__(self, github_content: str = "", portfolio_content: str = "",
                 verdict: str = "VERIFIED", confidence: int = 85,
                 verified_skills: list = None, unverified_skills: list = None,
                 fraud_detected: bool = False, reasoning: str = ""):
        self.github_content = github_content
        self.portfolio_content = portfolio_content
        self._verdict_data = {
            "verdict": verdict,
            "confidence": confidence,
            "verified_skills": verified_skills or [],
            "unverified_skills": unverified_skills or [],
            "fraud_detected": fraud_detected,
            "reasoning": reasoning or f"AI analysis produced {verdict} verdict with {confidence}% confidence."
        }

    def web_render(self, url: str, mode: str = "text") -> str:
        if "github" in url:
            return self.github_content
        return self.portfolio_content

    def exec_prompt(self, prompt: str, response_format: str = "json") -> str:
        # Cross-check prompt detection (contains "PREVIOUS AI VERDICT")
        if "PREVIOUS AI VERDICT" in prompt:
            return json.dumps({"agree": True, "verdict": self._verdict_data["verdict"], "reason": "Agrees."})
        return json.dumps(self._verdict_data)


class MockVm:
    """Simulates gl.vm.run_nondet_unsafe and gl.vm.Return."""
    class Return:
        def __init__(self, value: str):
            self.value = value

    def run_nondet_unsafe(self, leader_fn, validator_fn):
        leader_result = leader_fn()
        wrapped = MockVm.Return(leader_result)
        is_valid = validator_fn(wrapped)
        if not is_valid:
            raise Exception("Consensus failed: validator rejected leader result")
        return leader_result


class MockTreeMap(dict):
    """dict subclass that mimics TreeMap.get() with default."""
    def get(self, key, default=None):
        return super().get(key, default)


class MockContract:
    """
    Standalone test harness for CredChain contract logic.
    Mirrors the contract structure without GenVM dependency.
    """

    def __init__(self, nondet: MockNondet = None, sender: str = "0xCandidate1", timestamp: int = 1720000000):
        self.candidates = MockTreeMap()
        self.stakes = MockTreeMap()
        self.verifications = MockTreeMap()
        self.blacklist = MockTreeMap()
        self.verification_requests = MockTreeMap()
        self.request_counter = 0
        self._nondet = nondet or MockNondet(
            github_content="Python Django Flask React JavaScript TypeScript Solidity 200 commits",
            portfolio_content="Portfolio showcasing Python and React projects",
            verdict="VERIFIED",
            confidence=85,
            verified_skills=["Python", "React"],
            unverified_skills=["Solidity"],
            fraud_detected=False,
            reasoning="GitHub shows strong Python and React evidence."
        )
        self._message = MockMessage(sender, timestamp)
        self._vm = MockVm()

    def _sender(self) -> str:
        return str(self._message.sender_address)

    def _timestamp(self) -> int:
        return self._message.timestamp

    def register_candidate(self, name, claimed_skills, github_url, portfolio_url, sender=None):
        caller = sender or self._sender()
        if caller in self.blacklist and self.blacklist[caller]:
            raise Exception("Caller is blacklisted and cannot re-register")
        profile = {
            "name": name,
            "claimed_skills": claimed_skills,
            "github_url": github_url,
            "portfolio_url": portfolio_url,
            "registered_at": self._timestamp(),
            "status": "PENDING"
        }
        self.candidates[caller] = json.dumps(profile)

    def stake_bond(self, amount: int, sender=None):
        caller = sender or self._sender()
        if caller not in self.candidates:
            raise Exception("Must register as candidate before staking")
        if self.blacklist.get(caller, False):
            raise Exception("Blacklisted candidates cannot stake")
        existing = self.stakes.get(caller, 0)
        self.stakes[caller] = existing + amount

    def request_verification(self, candidate_address: str, requester=None) -> str:
        if not candidate_address or candidate_address == "0x0000000000000000000000000000000000000000":
            raise Exception("Candidate address cannot be empty or zero address")
        if candidate_address not in self.candidates:
            raise Exception("Candidate not registered")
        if self.blacklist.get(candidate_address, False):
            raise Exception("Candidate is blacklisted")
        request_id = str(self.request_counter)
        self.request_counter += 1
        request_data = {
            "request_id": request_id,
            "candidate_address": candidate_address,
            "requester": requester or self._sender(),
            "requested_at": self._timestamp(),
            "status": "PENDING"
        }
        self.verification_requests[request_id] = json.dumps(request_data)
        return request_id

    def execute_verification(self, request_id: str):
        if request_id not in self.verification_requests:
            raise Exception("Request not found: " + request_id)

        request_data = json.loads(self.verification_requests[request_id])

        if request_data.get("status") == "DONE":
            raise Exception("Verification already completed for request_id: " + request_id)

        candidate_address = request_data["candidate_address"]
        if candidate_address not in self.candidates:
            raise Exception("Candidate not registered")
        if self.blacklist.get(candidate_address, False):
            raise Exception("Candidate is blacklisted")

        stake_amount = self.stakes.get(candidate_address, 0)
        if stake_amount == 0:
            raise Exception("Insufficient bond: candidate must stake before verification.")

        candidate = json.loads(self.candidates[candidate_address])
        github_url = candidate["github_url"]
        portfolio_url = candidate.get("portfolio_url", "")
        claimed_skills = candidate["claimed_skills"]

        nd = self._nondet

        def leader_fn():
            github_content = ""
            github_readable = True
            try:
                github_content = nd.web_render(github_url)
                if not github_content or len(github_content.strip()) < 50:
                    github_readable = False
                    github_content = "GITHUB_UNREADABLE"
            except Exception:
                github_readable = False
                github_content = "GITHUB_UNREADABLE"

            portfolio_content = ""
            portfolio_readable = True
            if portfolio_url and portfolio_url.startswith("http"):
                try:
                    portfolio_content = nd.web_render(portfolio_url)
                    if not portfolio_content or len(portfolio_content.strip()) < 50:
                        portfolio_readable = False
                        portfolio_content = "PORTFOLIO_UNREADABLE"
                except Exception:
                    portfolio_readable = False
                    portfolio_content = "PORTFOLIO_UNREADABLE"
            else:
                portfolio_readable = False

            if not github_readable and not portfolio_readable:
                return json.dumps({
                    "verdict": "UNVERIFIED",
                    "confidence": 0,
                    "verified_skills": [],
                    "unverified_skills": [s.strip() for s in claimed_skills.split(",")],
                    "reasoning": "All evidence sources unreadable.",
                    "fraud_detected": False
                })

            return nd.exec_prompt("analysis", response_format="json")

        def validator_fn(leader_result) -> bool:
            # Accept both MockVm.Return and raw str (for test harness compatibility)
            if isinstance(leader_result, MockVm.Return):
                raw = leader_result.value
            elif isinstance(leader_result, str):
                raw = leader_result
            else:
                return False
            try:
                data = json.loads(raw)
            except Exception:
                return False
            if data.get("verdict") not in {"VERIFIED", "PARTIAL", "UNVERIFIED"}:
                return False
            conf = data.get("confidence", -1)
            if not isinstance(conf, int) or not (0 <= conf <= 100):
                return False
            if not isinstance(data.get("verified_skills"), list):
                return False
            if not isinstance(data.get("unverified_skills"), list):
                return False
            if not isinstance(data.get("fraud_detected"), bool):
                return False
            try:
                cross_raw = nd.exec_prompt("PREVIOUS AI VERDICT cross-check", response_format="json")
                cross_data = json.loads(cross_raw)
                cross_verdict = cross_data.get("verdict", "UNVERIFIED")
                tiers = ["UNVERIFIED", "PARTIAL", "VERIFIED"]
                li = tiers.index(data["verdict"]) if data["verdict"] in tiers else 0
                ci = tiers.index(cross_verdict) if cross_verdict in tiers else 0
                if abs(li - ci) > 1:
                    return False
            except Exception:
                pass
            return True

        result_raw = self._vm.run_nondet_unsafe(leader_fn, validator_fn)
        result_data = json.loads(result_raw)

        req = json.loads(self.verification_requests[request_id])
        candidate_address = req["candidate_address"]

        result_data["verified_at"] = self._timestamp()
        result_data["request_id"] = request_id
        self.verifications[candidate_address] = json.dumps(result_data)

        cand_obj = json.loads(self.candidates[candidate_address])
        cand_obj["status"] = result_data["verdict"]
        self.candidates[candidate_address] = json.dumps(cand_obj)

        req["status"] = "DONE"
        self.verification_requests[request_id] = json.dumps(req)

        if result_data.get("fraud_detected", False):
            self.blacklist[candidate_address] = True
            self.stakes[candidate_address] = 0
            cand_obj = json.loads(self.candidates[candidate_address])
            cand_obj["status"] = "BLACKLISTED"
            self.candidates[candidate_address] = json.dumps(cand_obj)

    def get_candidate_profile(self, address: str) -> str:
        return self.candidates.get(address, "")

    def get_verification_result(self, address: str) -> str:
        return self.verifications.get(address, "")

    def is_blacklisted(self, address: str) -> bool:
        return self.blacklist.get(address, False)

    def get_stake(self, address: str) -> int:
        return self.stakes.get(address, 0)


# ============================================================
# Test runner helpers
# ============================================================

PASS = "[PASS]"
FAIL = "[FAIL]"
results = []

def run_test(name: str, fn):
    try:
        fn()
        print(f"{PASS}  {name}")
        results.append((name, True, None))
    except AssertionError as e:
        print(f"{FAIL}  {name}\n       AssertionError: {e}")
        results.append((name, False, str(e)))
    except Exception as e:
        print(f"{FAIL}  {name}\n       Unexpected Exception: {e}")
        results.append((name, False, str(e)))

def expect_raises(fn, keyword: str = None):
    try:
        fn()
        raise AssertionError("Expected an exception but none was raised")
    except AssertionError:
        raise
    except Exception as e:
        if keyword and keyword.lower() not in str(e).lower():
            raise AssertionError(f"Expected error containing '{keyword}' but got: {e}")


# ============================================================
# TEST 1: Happy Path — full flow, VERIFIED verdict
# ============================================================
def test_happy_path_verified():
    nd = MockNondet(
        github_content="Python Django REST API 300 commits Flask React TypeScript",
        portfolio_content="Portfolio: Python web apps, React frontends, REST APIs",
        verdict="VERIFIED",
        confidence=88,
        verified_skills=["Python", "React"],
        unverified_skills=["Solidity"],
        fraud_detected=False,
        reasoning="GitHub profile shows 300+ Python commits across 5 projects and clear React usage."
    )
    contract = MockContract(nd, sender="0xCandidate1")

    # Register
    contract.register_candidate(
        name="Nguyen Van A",
        claimed_skills="Python, React, Solidity",
        github_url="https://github.com/candidate1",
        portfolio_url="https://candidate1.dev",
        sender="0xCandidate1"
    )
    profile = json.loads(contract.get_candidate_profile("0xCandidate1"))
    assert profile["status"] == "PENDING", f"Expected PENDING, got {profile['status']}"
    assert profile["name"] == "Nguyen Van A"

    # Stake
    contract.stake_bond(1000, sender="0xCandidate1")
    assert contract.get_stake("0xCandidate1") == 1000

    # Request verification
    request_id = contract.request_verification("0xCandidate1", requester="0xEmployer1")
    assert request_id == "0", f"Expected request_id '0', got '{request_id}'"

    # Execute AI verification
    contract.execute_verification(request_id)

    # Check result
    result = json.loads(contract.get_verification_result("0xCandidate1"))
    assert result["verdict"] == "VERIFIED", f"Expected VERIFIED, got {result['verdict']}"
    assert result["confidence"] == 88
    assert "Python" in result["verified_skills"]
    assert result["fraud_detected"] is False
    assert len(result["reasoning"]) > 10

    # Check candidate status updated
    profile = json.loads(contract.get_candidate_profile("0xCandidate1"))
    assert profile["status"] == "VERIFIED"

    # Bond not slashed
    assert contract.get_stake("0xCandidate1") == 1000
    assert not contract.is_blacklisted("0xCandidate1")


# ============================================================
# TEST 2: Fraud Detection — bond slashed, candidate blacklisted
# ============================================================
def test_fraud_detection_slash():
    nd = MockNondet(
        github_content="JavaScript hobby projects only. No Python repos found.",
        portfolio_content="Claims Python expert but portfolio is empty.",
        verdict="UNVERIFIED",
        confidence=15,
        verified_skills=[],
        unverified_skills=["Python", "Machine Learning", "TensorFlow"],
        fraud_detected=True,
        reasoning="Candidate claims Python/ML expert but GitHub has zero Python repos. Active deception detected."
    )
    contract = MockContract(nd, sender="0xFraudster")

    contract.register_candidate(
        name="Fake Expert",
        claimed_skills="Python, Machine Learning, TensorFlow",
        github_url="https://github.com/fraudster",
        portfolio_url="https://fraudster.dev",
        sender="0xFraudster"
    )
    contract.stake_bond(500, sender="0xFraudster")

    request_id = contract.request_verification("0xFraudster")
    contract.execute_verification(request_id)

    # Bond should be slashed
    assert contract.get_stake("0xFraudster") == 0, "Bond should be 0 after slash"
    assert contract.is_blacklisted("0xFraudster") is True, "Should be blacklisted"

    profile = json.loads(contract.get_candidate_profile("0xFraudster"))
    assert profile["status"] == "BLACKLISTED"

    result = json.loads(contract.get_verification_result("0xFraudster"))
    assert result["fraud_detected"] is True


# ============================================================
# TEST 3: Edge Case — invalid request_id raises
# ============================================================
def test_invalid_request_id():
    contract = MockContract()
    contract.register_candidate(
        "Test", "Python", "https://github.com/test", "", sender="0xTest"
    )
    contract.stake_bond(100, sender="0xTest")

    expect_raises(
        lambda: contract.execute_verification("99999"),
        keyword="not found"
    )


# ============================================================
# TEST 4: Edge Case — zero stake guard raises
# ============================================================
def test_zero_stake_guard():
    contract = MockContract()
    contract.register_candidate(
        "Unstaked User", "Python", "https://github.com/unstaked", "", sender="0xUnstaked"
    )
    # Deliberately do NOT call stake_bond()
    request_id = contract.request_verification("0xUnstaked")

    expect_raises(
        lambda: contract.execute_verification(request_id),
        keyword="bond"
    )


# ============================================================
# TEST 5: Edge Case — double-execution of same request_id rejected
# ============================================================
def test_double_execution_rejected():
    nd = MockNondet(
        github_content="Python Django 100 commits",
        portfolio_content="Python developer",
        verdict="PARTIAL",
        confidence=55,
        verified_skills=["Python"],
        unverified_skills=["React"],
        fraud_detected=False,
        reasoning="Some Python evidence found, React not evidenced."
    )
    contract = MockContract(nd, sender="0xDouble")

    contract.register_candidate(
        "Double Claim", "Python, React",
        "https://github.com/double", "https://double.dev",
        sender="0xDouble"
    )
    contract.stake_bond(200, sender="0xDouble")
    request_id = contract.request_verification("0xDouble")

    # First execution — should succeed
    contract.execute_verification(request_id)

    # Second execution on same request_id — should be rejected
    expect_raises(
        lambda: contract.execute_verification(request_id),
        keyword="already completed"
    )


# ============================================================
# TEST 6: Edge Case — unregistered candidate cannot be verified
# ============================================================
def test_unregistered_candidate():
    contract = MockContract()
    expect_raises(
        lambda: contract.request_verification("0xNobody"),
        keyword="not registered"
    )


# ============================================================
# TEST 7: Edge Case — blacklisted candidate cannot be reverified
# ============================================================
def test_blacklisted_cannot_reverify():
    nd = MockNondet(
        # Enough content to pass readability threshold (> 50 chars)
        github_content="JavaScript only. Zero Python repos. Claims Python expert but evidence contradicts.",
        portfolio_content="",
        verdict="UNVERIFIED",
        confidence=5,
        verified_skills=[],
        unverified_skills=["Python"],
        fraud_detected=True,
        reasoning="Active fraud: claims Python expert but GitHub has zero Python repos."
    )
    contract = MockContract(nd, sender="0xBadActor")

    contract.register_candidate(
        "Bad Actor", "Python", "https://github.com/bad", "", sender="0xBadActor"
    )
    contract.stake_bond(100, sender="0xBadActor")
    rid = contract.request_verification("0xBadActor")
    contract.execute_verification(rid)

    assert contract.is_blacklisted("0xBadActor") is True

    # Attempt new request for blacklisted candidate
    expect_raises(
        lambda: contract.request_verification("0xBadActor"),
        keyword="blacklisted"
    )


# ============================================================
# TEST 8: Edge Case — all sources unreadable → auto UNVERIFIED
# ============================================================
def test_all_sources_unreadable():
    nd = MockNondet(
        github_content="",     # empty = unreadable
        portfolio_content="",  # empty = unreadable
        # Set verdict=UNVERIFIED so cross-check also returns UNVERIFIED (matches auto path)
        verdict="UNVERIFIED",
        confidence=0,
        verified_skills=[],
        unverified_skills=["Python", "React"],
        fraud_detected=False,
        reasoning="All sources unreadable, cannot verify."
    )
    contract = MockContract(nd, sender="0xNoEvidence")

    contract.register_candidate(
        "No Evidence", "Python, React",
        "https://github.com/noevidence",
        "",  # no portfolio
        sender="0xNoEvidence"
    )
    contract.stake_bond(100, sender="0xNoEvidence")
    rid = contract.request_verification("0xNoEvidence")
    contract.execute_verification(rid)

    result = json.loads(contract.get_verification_result("0xNoEvidence"))
    # Should be auto-UNVERIFIED since both sources unreadable
    assert result["verdict"] == "UNVERIFIED", f"Expected UNVERIFIED, got {result['verdict']}"
    assert result["confidence"] == 0
    assert result["fraud_detected"] is False


# ============================================================
# NEW TESTS: Employer-Initiated Verification Flows
# ============================================================
def test_two_wallet_verification_flow():
    # Wallet A registers and stakes as candidate
    # Wallet B requests verification for Wallet A
    nd = MockNondet(
        github_content="This is a dummy github profile content with more than fifty characters to pass the validator.",
        verdict="VERIFIED", confidence=90, verified_skills=["Python"]
    )
    contract = MockContract(nd, sender="0xEmployerWalletB")

    # Wallet A registers
    contract.register_candidate(
        name="Candidate Wallet A",
        claimed_skills="Python",
        github_url="https://github.com/candidateA",
        portfolio_url="",
        sender="0xCandidateWalletA"
    )
    # Wallet A stakes
    contract.stake_bond(1000, sender="0xCandidateWalletA")

    # Wallet B requests verification for Wallet A
    request_id = contract.request_verification("0xCandidateWalletA", requester="0xEmployerWalletB")

    # Stored candidate_address equals Wallet A
    # Stored requester equals Wallet B
    req = json.loads(contract.verification_requests[request_id])
    assert req["candidate_address"] == "0xCandidateWalletA"
    assert req["requester"] == "0xEmployerWalletB"
    assert req["status"] == "PENDING"

    # Execute verification
    contract.execute_verification(request_id)

    # Check result
    result = json.loads(contract.get_verification_result("0xCandidateWalletA"))
    assert result["verdict"] == "VERIFIED"
    assert result["confidence"] == 90


def test_reject_empty_candidate_address():
    contract = MockContract()
    # Reject empty
    expect_raises(
        lambda: contract.request_verification(""),
        keyword="cannot be empty"
    )
    # Reject zero address
    expect_raises(
        lambda: contract.request_verification("0x0000000000000000000000000000000000000000"),
        keyword="cannot be empty"
    )


def test_execute_verification_uses_stored_candidate():
    # Execute verification should load from the stored request and verify the selected candidate,
    # even if called by a different caller address (e.g. any validator or executor)
    nd = MockNondet(
        github_content="This is a dummy github profile content with more than fifty characters to pass the validator.",
        verdict="VERIFIED", confidence=95, verified_skills=["TypeScript"]
    )
    contract = MockContract(nd, sender="0xSomeExecutor")

    # Register candidate C
    contract.register_candidate(
        name="Candidate C",
        claimed_skills="TypeScript",
        github_url="https://github.com/candidateC",
        portfolio_url="",
        sender="0xCandidateC"
    )
    contract.stake_bond(500, sender="0xCandidateC")

    # Employer requests verification
    request_id = contract.request_verification("0xCandidateC", requester="0xEmployerE")

    # Execute verification by someone else (0xSomeExecutor)
    contract.execute_verification(request_id)

    # Candidate profile should be verified
    profile = json.loads(contract.get_candidate_profile("0xCandidateC"))
    assert profile["status"] == "VERIFIED"
    
    result = json.loads(contract.get_verification_result("0xCandidateC"))
    assert result["verdict"] == "VERIFIED"


def test_self_verification_flow():
    nd = MockNondet(verdict="VERIFIED", confidence=80, verified_skills=["Python"])
    contract = MockContract(nd, sender="0xCandidateSelf")

    contract.register_candidate(
        name="Self Verify",
        claimed_skills="Python",
        github_url="https://github.com/self",
        portfolio_url="",
        sender="0xCandidateSelf"
    )
    contract.stake_bond(500, sender="0xCandidateSelf")

    # Candidate requests verification for themselves
    request_id = contract.request_verification("0xCandidateSelf", requester="0xCandidateSelf")

    # Stored candidate_address equals candidate wallet, requester equals candidate wallet
    req = json.loads(contract.verification_requests[request_id])
    assert req["candidate_address"] == "0xCandidateSelf"
    assert req["requester"] == "0xCandidateSelf"


# ============================================================
# Run all tests
# ============================================================
if __name__ == "__main__":
    print("=" * 60)
    print("CredChain Contract Test Suite")
    print("=" * 60)

    run_test("Happy Path - full flow, VERIFIED verdict", test_happy_path_verified)
    run_test("Fraud Detection — bond slashed + blacklisted", test_fraud_detection_slash)
    run_test("Invalid request_id raises exception", test_invalid_request_id)
    run_test("Zero stake guard raises exception", test_zero_stake_guard)
    run_test("Double-execution rejected", test_double_execution_rejected)
    run_test("Unregistered candidate cannot be verified", test_unregistered_candidate)
    run_test("Blacklisted candidate cannot be reverified", test_blacklisted_cannot_reverify)
    run_test("All sources unreadable -> auto UNVERIFIED", test_all_sources_unreadable)
    run_test("Two-wallet verification flow", test_two_wallet_verification_flow)
    run_test("Reject empty candidate address", test_reject_empty_candidate_address)
    run_test("Execute verification uses stored candidate", test_execute_verification_uses_stored_candidate)
    run_test("Self-verification flow", test_self_verification_flow)

    print("=" * 60)
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"Results: {passed}/{total} tests passed")
    if passed < total:
        print("\nFailed tests:")
        for name, ok, err in results:
            if not ok:
                print(f"  - {name}: {err}")
        sys.exit(1)
    else:
        print("All tests passed! [OK]")
        print("All tests passed! [OK]")
