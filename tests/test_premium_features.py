import sys
import json
import types

# ============================================================
# Mock GenLayer module before importing the contract
# ============================================================

genlayer_mod = types.ModuleType("genlayer")

class MockAddress:
    def __init__(self, addr: str):
        self._addr = addr
    def __str__(self):
        return self._addr
    def __repr__(self):
        return self._addr
    def __eq__(self, other):
        return str(self) == str(other)

class MockMessage:
    def __init__(self):
        self.sender_address = MockAddress("0xCandidate")
        self.value = 0

class MockPublic:
    def write(self, func):
        return func
    def view(self, func):
        return func

class MockNondetWeb:
    def render(self, url: str, mode: str = "text") -> str:
        return "Python developer resume."

class MockNondet:
    def __init__(self):
        self.web = MockNondetWeb()
        self.score_to_return = 85
        self.questions_to_return = ["What is python?", "How does react work?", "Explain solidity vs vyper."]
        self.verdict_to_return = "VERIFIED"

    def exec_prompt(self, prompt: str, response_format: str = "json") -> str:
        if "interview" in prompt.lower():
            if "grade" in prompt.lower():
                return json.dumps({"score": self.score_to_return, "feedback": "Good response"})
            else:
                return json.dumps({"questions": self.questions_to_return})
        if "appeal" in prompt.lower():
            return json.dumps({"verdict": self.verdict_to_return, "reasoning": "Appeal processed."})
        return json.dumps({"verdict": "VERIFIED", "confidence": 90, "verified_skills": ["Python"], "unverified_skills": [], "fraud_detected": False})

class MockVm:
    def __init__(self, nd):
        self.nd = nd

    def run_nondet_unsafe(self, leader_fn, validator_fn):
        res = leader_fn()
        class FakeVal:
            def __init__(self, val):
                self.value = val
        valid = validator_fn(FakeVal(res))
        if not valid:
            raise Exception("Consensus failed in validator check")
        return res

class MockTreeMap(dict):
    def get(self, key, default=None):
        return super().get(key, default)

# Set attributes on genlayer module
genlayer_mod.Address = MockAddress
genlayer_mod.u256 = int
genlayer_mod.Contract = object
genlayer_mod.TreeMap = MockTreeMap
genlayer_mod.message = MockMessage()
genlayer_mod.public = MockPublic()
genlayer_mod.nondet = MockNondet()
genlayer_mod.vm = MockVm(genlayer_mod.nondet)
genlayer_mod.gl = genlayer_mod

send_calls = []
def mock_send(to_addr, amount):
    send_calls.append((str(to_addr), amount))
genlayer_mod.send = mock_send

sys.modules["genlayer"] = genlayer_mod

# Add project root to sys.path to import contract
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from contracts.CredChain import Contract

# Patch Contract.__init__ to initialize TreeMap variables as MockTreeMap
def patch_init(self):
    for name, anno in Contract.__annotations__.items():
        if "TreeMap" in str(anno):
            setattr(self, name, MockTreeMap())
    self.request_counter = 0
    self.bounty_counter = 0

Contract.__init__ = patch_init

# ============================================================
# Test Cases
# ============================================================

def test_happy_path_features():
    global send_calls
    send_calls = []
    genlayer_mod.nondet.score_to_return = 85
    genlayer_mod.nondet.questions_to_return = ["What is python?", "How does react work?", "Explain solidity vs vyper."]
    genlayer_mod.nondet.verdict_to_return = "VERIFIED"

    c = Contract()
    
    # 1. Extended Registration
    genlayer_mod.message.sender_address = MockAddress("0xCandidate")
    c.register_candidate_extended(
        name="Hop", claimed_skills="Python",
        github_url="https://github.com/hop", portfolio_url="",
        leetcode_user="hop_lc", stackoverflow_id="hop_so", cv_url=""
    )
    
    profile = json.loads(c.get_candidate_profile(MockAddress("0xCandidate")))
    assert profile["name"] == "Hop"
    assert profile["leetcode_user"] == "hop_lc"
    assert c.get_candidate_tier(MockAddress("0xCandidate")) == "BRONZE"

    # 2. Staking
    c.stake(500)
    assert c.get_stake(MockAddress("0xCandidate")) == 500
    c.stake(500)
    assert c.get_candidate_tier(MockAddress("0xCandidate")) == "BRONZE"

    # 3. AI Interview
    c.generate_interview_questions(MockAddress("0xCandidate"))
    assert c.get_interview_status(MockAddress("0xCandidate")) == "GENERATED"
    
    answers = ["Ans 1", "Ans 2", "Ans 3"]
    c.submit_interview_answers(MockAddress("0xCandidate"), json.dumps(answers))
    assert c.get_interview_status(MockAddress("0xCandidate")) == "ANSWERED"

    c.grade_interview(MockAddress("0xCandidate"))
    assert c.get_interview_status(MockAddress("0xCandidate")) == "GRADED"
    assert c.get_interview_score(MockAddress("0xCandidate")) == 85
    assert c.get_reputation_score(MockAddress("0xCandidate")) == 85
    
    assert c.get_candidate_tier(MockAddress("0xCandidate")) == "SILVER"

    # 4. Job Bounty Escrow
    genlayer_mod.message.sender_address = MockAddress("0xEmployer")
    genlayer_mod.message.value = 1500
    job_id = c.create_job_bounty("Python Dev", "Python", 1500)
    assert job_id == 0
    assert c.get_job_escrow(job_id) == 1500
    
    # Candidate applies
    genlayer_mod.message.sender_address = MockAddress("0xCandidate")
    c.apply_to_job_bounty(job_id)
    applicants = json.loads(c.get_job_applicants(job_id))
    assert "0xCandidate" in applicants

    # Employer awards bounty
    genlayer_mod.message.sender_address = MockAddress("0xEmployer")
    c.award_job_bounty(job_id, MockAddress("0xCandidate"))
    assert c.get_job_escrow(job_id) == 0
    assert ("0xCandidate", 1500) in send_calls

    # 5. Appeal Success
    c.blacklist[str(MockAddress("0xCandidate"))] = True
    c.staked_amount[str(MockAddress("0xCandidate"))] = 0
    
    genlayer_mod.message.sender_address = MockAddress("0xCandidate")
    c.submit_appeal("I am innocent")
    assert c.get_appeal_used(MockAddress("0xCandidate")) == True
    
    c.execute_appeal(MockAddress("0xCandidate"))
    appeal = json.loads(c.get_appeal(MockAddress("0xCandidate")))
    assert appeal["status"] == "WON"
    assert c.is_blacklisted(MockAddress("0xCandidate")) == False
    assert ("0xCandidate", 100) in send_calls


# ============================================================
# 8 Negative Scenarios Tests
# ============================================================

def test_negative_cases():
    c = Contract()
    genlayer_mod.message.sender_address = MockAddress("0xCandidate")
    c.register_candidate_extended("Hop", "Python", "https://github.com/hop", "", "", "", "")
    c.generate_interview_questions(MockAddress("0xCandidate"))

    # Case 1: submit_interview_answers by non-candidate throws
    genlayer_mod.message.sender_address = MockAddress("0xHacker")
    try:
        c.submit_interview_answers(MockAddress("0xCandidate"), json.dumps(["A1", "A2", "A3"]))
        assert False, "Should raise authorization error"
    except Exception as e:
        assert "NOT_AUTHORIZED" in str(e)

    # Case 2: award_job_bounty requested by non-creator throws
    genlayer_mod.message.sender_address = MockAddress("0xEmployer")
    genlayer_mod.message.value = 1000
    job_id = c.create_job_bounty("Rust Dev", "Rust", 1000)
    
    genlayer_mod.message.sender_address = MockAddress("0xCandidate")
    c.apply_to_job_bounty(job_id)
    
    genlayer_mod.message.sender_address = MockAddress("0xHacker")
    try:
        c.award_job_bounty(job_id, MockAddress("0xCandidate"))
        assert False, "Should raise owner error"
    except Exception as e:
        assert "NOT_AUTHORIZED" in str(e)

    # Case 3: apply_to_job_bounty twice throws
    genlayer_mod.message.sender_address = MockAddress("0xCandidate")
    try:
        c.apply_to_job_bounty(job_id)
        assert False, "Should raise duplicate application error"
    except Exception as e:
        assert "ALREADY_APPLIED" in str(e)

    # Case 4: submit_appeal when appeal_used == True throws
    c.blacklist[str(MockAddress("0xCandidate"))] = True
    c.submit_appeal("First appeal")
    try:
        c.submit_appeal("Second appeal")
        assert False, "Should reject second appeal"
    except Exception as e:
        assert "APPEAL_ALREADY_USED" in str(e)

    # Case 5: cancel_job_bounty for CLOSED/CANCELLED job throws
    genlayer_mod.message.sender_address = MockAddress("0xEmployer")
    c.cancel_job_bounty(job_id)
    try:
        c.cancel_job_bounty(job_id)
        assert False, "Should reject cancel on cancelled job"
    except Exception as e:
        assert "Job is not open" in str(e)

    # Case 6: award_job_bounty to non-applicant throws
    genlayer_mod.message.sender_address = MockAddress("0xEmployer")
    job_id_2 = c.create_job_bounty("Go Dev", "Go", 500)
    try:
        c.award_job_bounty(job_id_2, MockAddress("0xHacker"))
        assert False, "Should reject award to non-applicant"
    except Exception as e:
        assert "INVALID_WINNER" in str(e)

    # Case 7: Low reputation prevents tier upgrades
    genlayer_mod.message.sender_address = MockAddress("0xCandidate2")
    c.register_candidate_extended("Candidate2", "C++", "", "", "", "", "")
    c.staked_amount[str(MockAddress("0xCandidate2"))] = 2000
    c.reputation_scores[str(MockAddress("0xCandidate2"))] = 40
    c._update_tier(str(MockAddress("0xCandidate2")))
    assert c.get_candidate_tier(MockAddress("0xCandidate2")) == "BRONZE"

    # Case 8: Grade deviation > 10 causes validator consensus rejection
    genlayer_mod.message.sender_address = MockAddress("0xCandidate")
    c.interview_questions[str(MockAddress("0xCandidate"))] = json.dumps(["Q1?", "Q2?", "Q3?"])
    c.interview_answers[str(MockAddress("0xCandidate"))] = json.dumps(["A1", "A2", "A3"])
    c.interview_status[str(MockAddress("0xCandidate"))] = "ANSWERED"
    
    genlayer_mod.nondet.score_to_return = 85
    original_exec = genlayer_mod.nondet.exec_prompt
    call_count = 0
    def mock_exec_prompt(prompt, response_format="json"):
        nonlocal call_count
        if "grade" in prompt.lower():
            call_count += 1
            if call_count == 2:
                # Validator call - returns 60 (deviation of 25 > 10)
                return json.dumps({"score": 60, "feedback": "Poor response"})
        return original_exec(prompt, response_format)
    genlayer_mod.nondet.exec_prompt = mock_exec_prompt

    try:
        c.grade_interview(MockAddress("0xCandidate"))
        assert False, "Validator should reject result due to deviation"
    except Exception as e:
        assert "Consensus failed" in str(e)


# ============================================================
# Main Execution
# ============================================================
if __name__ == "__main__":
    print("=" * 60)
    print("CredChain Premium Features Test Suite")
    print("=" * 60)
    
    results = []
    def run_case(name, func):
        try:
            func()
            print(f"[PASS] {name}")
            results.append((name, True, ""))
        except Exception as e:
            print(f"[FAIL] {name}: {e}")
            results.append((name, False, str(e)))
            
    run_case("Happy Path premium features verification", test_happy_path_features)
    run_case("8 Negative Cases verification", test_negative_cases)
    
    print("=" * 60)
    passed = sum(1 for _, ok, _ in results if ok)
    total = len(results)
    print(f"Results: {passed}/{total} tests passed")
    if passed < total:
        sys.exit(1)
    else:
        print("All tests passed! [OK]")
