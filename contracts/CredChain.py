# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json

def normalize_skills(skills_str_or_list) -> list:
    if isinstance(skills_str_or_list, str):
        if "," in skills_str_or_list:
            parts = skills_str_or_list.split(",")
        else:
            parts = skills_str_or_list.split()
    elif isinstance(skills_str_or_list, list):
        parts = skills_str_or_list
    else:
        return []
    normalized = []
    for p in parts:
        if isinstance(p, str):
            cleaned = p.strip().lower()
            if cleaned and cleaned not in normalized:
                normalized.append(cleaned)
    return normalized

def robust_json_loads(s) -> dict:
    if isinstance(s, dict):
        return s
    if not isinstance(s, str):
        raise Exception("Input to robust_json_loads must be str or dict")
    s_clean = s.strip()
    if s_clean.startswith("```json"):
        s_clean = s_clean[7:]
    if s_clean.startswith("```"):
        s_clean = s_clean[3:]
    if s_clean.endswith("```"):
        s_clean = s_clean[:-3]
    s_clean = s_clean.strip()
    
    try:
        return json.loads(s_clean)
    except Exception:
        pass
        
    try:
        cleaned = s_clean
        for _ in range(10):
            cleaned = cleaned.replace(", ]", "]").replace(",]", "]")
            cleaned = cleaned.replace(", }", "}").replace(",}", "}")
            
        keys = ["verdict", "confidence", "verified_skills", "unverified_skills", "reasoning", "fraud_detected", "agree"]
        for k in keys:
            key_str = '"' + k + '"'
            idx = 0
            while True:
                idx = cleaned.find(key_str, idx)
                if idx == -1:
                    break
                if idx > 0:
                    back_idx = idx - 1
                    while back_idx > 0 and cleaned[back_idx].isspace():
                        back_idx -= 1
                    prev_char = cleaned[back_idx]
                    if prev_char not in ['{', ',', ':', '[']:
                        cleaned = cleaned[:idx] + "," + cleaned[idx:]
                        idx += 2
                        continue
                idx += 1
                
        return json.loads(cleaned)
    except Exception:
        pass
        
    res = {}
    
    def find_str_val(key: str, default: str) -> str:
        k_str = '"' + key + '"'
        idx = s_clean.find(k_str)
        if idx == -1:
            return default
        colon_idx = s_clean.find(":", idx)
        if colon_idx == -1:
            return default
        start_quote = s_clean.find('"', colon_idx + 1)
        if start_quote == -1:
            return default
        end_quote = s_clean.find('"', start_quote + 1)
        if end_quote == -1:
            return default
        return s_clean[start_quote+1:end_quote]
        
    def find_int_val(key: str, default: int) -> int:
        k_str = '"' + key + '"'
        idx = s_clean.find(k_str)
        if idx == -1:
            return default
        colon_idx = s_clean.find(":", idx)
        if colon_idx == -1:
            return default
        val_str = ""
        for char in s_clean[colon_idx+1:]:
            if char.isdigit():
                val_str += char
            elif val_str and not char.isspace():
                break
        return int(val_str) if val_str else default
        
    def find_bool_val(key: str, default: bool) -> bool:
        k_str = '"' + key + '"'
        idx = s_clean.find(k_str)
        if idx == -1:
            return default
        colon_idx = s_clean.find(":", idx)
        if colon_idx == -1:
            return default
        substr = s_clean[colon_idx+1:colon_idx+20].lower()
        if "true" in substr:
            return True
        if "false" in substr:
            return False
        return default
        
    def find_list_val(key: str) -> list:
        k_str = '"' + key + '"'
        idx = s_clean.find(k_str)
        if idx == -1:
            return []
        colon_idx = s_clean.find(":", idx)
        if colon_idx == -1:
            return []
        start_bracket = s_clean.find("[", colon_idx)
        if start_bracket == -1:
            return []
        end_bracket = s_clean.find("]", start_bracket)
        if end_bracket == -1:
            return []
        list_str = s_clean[start_bracket+1:end_bracket]
        items = []
        for x in list_str.split(","):
            x_clean = x.replace('"', '').strip()
            if x_clean:
                items.append(x_clean)
        return items

    res["verdict"] = find_str_val("verdict", "UNVERIFIED")
    if res["verdict"] not in ["VERIFIED", "PARTIAL", "UNVERIFIED"]:
        res["verdict"] = "UNVERIFIED"
    res["confidence"] = find_int_val("confidence", 50)
    res["fraud_detected"] = find_bool_val("fraud_detected", False)
    res["reasoning"] = find_str_val("reasoning", "Verification processed.")
    res["verified_skills"] = find_list_val("verified_skills")
    res["unverified_skills"] = find_list_val("unverified_skills")
    res["agree"] = find_bool_val("agree", False)
    
    return res


class Contract(gl.Contract):
    candidates: TreeMap[str, str]             # Address str -> JSON candidate profile (name, claimed_skills, github_url, portfolio_url, leetcode_user, stackoverflow_id, cv_url, registered_at, status)
    stakes: TreeMap[str, u256]                # Address str -> staked GEN (compat with legacy tests)
    verifications: TreeMap[str, str]          # Address str -> JSON verification result
    blacklist: TreeMap[str, bool]             # Address str -> True if slashed
    verification_requests: TreeMap[str, str]  # request_id -> JSON request metadata
    request_counter: u256                     # auto-increment ID
    
    # v2 variables
    reputation_scores: TreeMap[str, u256]     # Address str -> reputation score (0-100)
    staked_amount: TreeMap[str, u256]         # Address str -> staked GEN amount
    candidate_tier: TreeMap[str, str]          # Address str -> "BRONZE|SILVER|GOLD|PLATINUM"
    
    interview_questions: TreeMap[str, str]    # Address str -> JSON list of questions
    interview_answers: TreeMap[str, str]      # Address str -> JSON list of answers
    interview_score: TreeMap[str, u256]       # Address str -> score (0-100)
    interview_status: TreeMap[str, str]       # Address str -> "NOT_STARTED|GENERATED|ANSWERED|GRADED"
    
    bounty_counter: u256                      # auto-increment ID for job bounties
    job_bounties: TreeMap[u256, str]          # job_id -> JSON job info (title, employer, bounty_amount, status)
    job_escrow: TreeMap[u256, u256]           # job_id -> escrowed bounty GEN amount
    job_applicants: TreeMap[u256, str]        # job_id -> JSON list of applicant addresses
    
    appeals: TreeMap[str, str]                # Address str -> JSON appeal data (reasoning, fee_paid, status)
    appeal_used: TreeMap[str, bool]           # Address str -> True if appeal already used

    def __init__(self):
        self.request_counter = u256(0)
        self.bounty_counter = u256(0)

    @gl.public.write
    def register_candidate(
        self,
        name: str,
        claimed_skills: str,
        github_url: str,
        portfolio_url: str
    ) -> None:
        """Legacy registration mapping to extended registration."""
        self.register_candidate_extended(name, claimed_skills, github_url, portfolio_url, "", "", "")

    @gl.public.write
    def register_candidate_extended(
        self,
        name: str,
        claimed_skills: str,
        github_url: str,
        portfolio_url: str,
        leetcode_user: str,
        stackoverflow_id: str,
        cv_url: str
    ) -> None:
        """Register a candidate profile supporting multi-platform credentials."""
        caller = str(gl.message.sender_address)
        if self.blacklist.get(caller, False):
            raise Exception("Caller is blacklisted and cannot re-register")
        
        profile = {
            "name": name,
            "claimed_skills": claimed_skills,
            "github_url": github_url,
            "portfolio_url": portfolio_url,
            "leetcode_user": leetcode_user,
            "stackoverflow_id": stackoverflow_id,
            "cv_url": cv_url,
            "registered_at": 0,
            "status": "PENDING"
        }
        self.candidates[caller] = json.dumps(profile)
        
        if caller not in self.candidate_tier:
            self.candidate_tier[caller] = "BRONZE"
        if caller not in self.reputation_scores:
            self.reputation_scores[caller] = u256(0)
        if caller not in self.interview_status:
            self.interview_status[caller] = "NOT_STARTED"

    @gl.public.write
    def stake_bond(self, amount: u256) -> None:
        """Legacy staking method mapped to stake."""
        self.stake(amount)

    @gl.public.write
    def stake(self, amount: u256) -> None:
        """Stake native tokens to secure reputation tier."""
        caller = str(gl.message.sender_address)
        if caller not in self.candidates:
            raise Exception("Must register as candidate before staking")
        if self.blacklist.get(caller, False):
            raise Exception("Blacklisted candidates cannot stake")
        
        existing = self.staked_amount.get(caller, u256(0))
        new_amount = existing + amount
        self.staked_amount[caller] = new_amount
        self.stakes[caller] = new_amount
        
        self._update_tier(caller)

    @gl.public.write
    def unstake(self, amount: u256) -> None:
        """Unstake native tokens, downgrading tier if criteria not met."""
        caller = str(gl.message.sender_address)
        if caller not in self.candidates:
            raise Exception("Must register as candidate before unstaking")
        existing = self.staked_amount.get(caller, u256(0))
        if existing < amount:
            raise Exception("Insufficient staked balance to unstake")
        
        new_amount = existing - amount
        self.staked_amount[caller] = new_amount
        self.stakes[caller] = new_amount
        
        self._update_tier(caller)

    def _update_tier(self, candidate_address: str) -> None:
        stake_val = int(self.staked_amount.get(candidate_address, u256(0)))
        rep_val = int(self.reputation_scores.get(candidate_address, u256(0)))
        
        if stake_val >= 5000 and rep_val >= 85:
            self.candidate_tier[candidate_address] = "PLATINUM"
        elif stake_val >= 2000 and rep_val >= 70:
            self.candidate_tier[candidate_address] = "GOLD"
        elif stake_val >= 1000 and rep_val >= 50:
            self.candidate_tier[candidate_address] = "SILVER"
        elif stake_val >= 500:
            self.candidate_tier[candidate_address] = "BRONZE"
        else:
            self.candidate_tier[candidate_address] = "NONE"

    @gl.public.write
    def request_verification(self, candidate_address: Address) -> str:
        """Employer requests AI verification of a candidate's profile."""
        requester = str(gl.message.sender_address)
        candidate_addr_str = str(candidate_address)
        if not candidate_addr_str or candidate_addr_str == "0x0000000000000000000000000000000000000000":
            raise Exception("Candidate address cannot be empty or zero address")
        if candidate_addr_str not in self.candidates:
            raise Exception("Candidate not registered")
        if self.blacklist.get(candidate_addr_str, False):
            raise Exception("Candidate is blacklisted")
            
        request_id = str(int(self.request_counter))
        self.request_counter = self.request_counter + u256(1)
        request_data = {
            "request_id": request_id,
            "candidate_address": candidate_addr_str,
            "requester": requester,
            "requested_at": 0,
            "status": "PENDING"
        }
        self.verification_requests[request_id] = json.dumps(request_data)
        return request_id

    @gl.public.write
    def execute_verification(self, request_id: str) -> None:
        """Consensus AI validation of evidence sources."""
        request_id_str = str(request_id)
        if request_id_str not in self.verification_requests:
            raise Exception("Request not found: " + request_id_str)
        request_data = json.loads(self.verification_requests[request_id_str])
        if request_data.get("status") == "DONE":
            raise Exception("Verification already completed for request_id: " + request_id_str)

        candidate_address = request_data["candidate_address"]
        if candidate_address not in self.candidates:
            raise Exception("Candidate not registered")
        if self.blacklist.get(candidate_address, False):
            raise Exception("Candidate is blacklisted")

        stake_amount = self.staked_amount.get(candidate_address, u256(0))
        if stake_amount == u256(0):
            raise Exception("Insufficient bond: candidate must stake before verification.")

        candidate = json.loads(self.candidates[candidate_address])
        github_url = candidate["github_url"]
        portfolio_url = candidate.get("portfolio_url", "")
        claimed_skills = candidate["claimed_skills"]

        def leader_fn():
            github_content = ""
            github_readable = True
            try:
                github_content = gl.nondet.web.render(github_url, mode="text")
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
                    portfolio_content = gl.nondet.web.render(portfolio_url, mode="text")
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
                    "verdict": "UNVERIFIED", "confidence": 0,
                    "verified_skills": [],
                    "unverified_skills": [s.strip() for s in claimed_skills.split(",")],
                    "reasoning": "All evidence sources were inaccessible. Cannot verify skills without evidence.",
                    "fraud_detected": False,
                    "agree": True
                })

            analysis_task = f"""You are a senior technical HR verification expert.
Analyze the evidence and determine if the candidate's claimed skills are genuinely demonstrated.

CLAIMED SKILLS: {claimed_skills}

GITHUB PROFILE CONTENT (first 3000 chars):
{github_content[:3000]}

PORTFOLIO CONTENT (first 2000 chars):
{portfolio_content[:2000]}

VERDICT CRITERIA:
- VERIFIED = >=70% of claimed skills clearly evidenced
- PARTIAL = 30-69% of claimed skills evidenced
- UNVERIFIED = <30% evidenced OR all sources inaccessible
- fraud_detected = true ONLY if evidence actively contradicts claims

Respond with ONLY a JSON object (no markdown):
{{
  "verdict": "VERIFIED" or "PARTIAL" or "UNVERIFIED",
  "confidence": <integer 0-100>,
  "verified_skills": [<skill strings>],
  "unverified_skills": [<skill strings>],
  "reasoning": "<2-3 sentences citing specific evidence>",
  "fraud_detected": <true or false>
}}"""
            # POLICY DECISION: AI analyzes raw web content and provides verification result
            return gl.nondet.exec_prompt(analysis_task, response_format="json")

        def validator_fn(leader_result) -> bool:
            if not hasattr(leader_result, "calldata"):
                return False
            try:
                raw = leader_result.calldata
                data = robust_json_loads(raw)
                if data.get("verdict") not in {"VERIFIED", "PARTIAL", "UNVERIFIED"}:
                    return False
                confidence = data.get("confidence", -1)
                if not isinstance(confidence, int) or not (0 <= confidence <= 100):
                    return False
                if not isinstance(data.get("verified_skills"), list):
                    return False
                if not isinstance(data.get("unverified_skills"), list):
                    return False
                if not isinstance(data.get("fraud_detected"), bool):
                    return False
                reasoning = data.get("reasoning", "")
                if not isinstance(reasoning, str) or len(reasoning.strip()) < 10:
                    return False
                
                # Invariants check
                claimed_list = normalize_skills(claimed_skills)
                verified_list = normalize_skills(data.get("verified_skills", []))
                unverified_list = normalize_skills(data.get("unverified_skills", []))
                
                if any(s in unverified_list for s in verified_list):
                    return False
                claimed_set = set(claimed_list)
                if any(s not in claimed_set for s in verified_list + unverified_list):
                    return False
                if set(verified_list + unverified_list) != claimed_set:
                    return False
                if len(claimed_list) > 0 and len(verified_list) == 0 and len(unverified_list) == 0:
                    return False
                
                ratio = len(verified_list) / len(claimed_list) if len(claimed_list) > 0 else 0
                expected_verdict = "UNVERIFIED"
                if ratio >= 0.7:
                    expected_verdict = "VERIFIED"
                elif ratio >= 0.3:
                    expected_verdict = "PARTIAL"
                if data.get("verdict") != expected_verdict:
                    return False

                # Independent evidence verification
                val_github_content = ""
                val_github_readable = True
                try:
                    val_github_content = gl.nondet.web.render(github_url, mode="text")
                    if not val_github_content or len(val_github_content.strip()) < 50:
                        val_github_readable = False
                except Exception:
                    val_github_readable = False
                    
                if not val_github_readable:
                    if data.get("verdict") != "UNVERIFIED":
                        return False
                else:
                    # Validator runs comparative LLM check using independently fetched content
                    val_prompt = f"""You are an independent credential validator. Verify if the leader's verdict is reasonable.
CLAIMED SKILLS: {claimed_skills}
GITHUB CONTENT: {val_github_content[:2000]}
LEADER VERDICT: {data.get("verdict")}
LEADER REASONING: {reasoning}

Respond with ONLY a JSON object:
{{
  "agree": true or false,
  "reason": "short explanation"
}}"""
                    try:
                        val_res = gl.nondet.exec_prompt(val_prompt, response_format="json")
                        val_res_data = robust_json_loads(val_res)
                        if not val_res_data.get("agree", False):
                            return False
                    except Exception:
                        pass
                
                return True
            except Exception:
                return False

        result_raw = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        result_data = robust_json_loads(result_raw)

        req = json.loads(self.verification_requests[request_id_str])
        candidate_address = req["candidate_address"]
        result_data["verified_at"] = 0
        result_data["request_id"] = request_id_str
        
        # ON-CHAIN STATE UPDATE: Save verification details directly to contract storage
        self.verifications[candidate_address] = json.dumps(result_data)

        # ON-CHAIN STATE UPDATE: Update candidate status directly based on the AI policy decision
        cand_obj = json.loads(self.candidates[candidate_address])
        cand_obj["status"] = result_data["verdict"]
        self.candidates[candidate_address] = json.dumps(cand_obj)

        req["status"] = "DONE"
        req["completed_at"] = 0
        self.verification_requests[request_id_str] = json.dumps(req)

        if result_data.get("fraud_detected", False):
            self.blacklist[candidate_address] = True
            self.staked_amount[candidate_address] = u256(0)
            self.stakes[candidate_address] = u256(0)
            cand_obj = json.loads(self.candidates[candidate_address])
            cand_obj["status"] = "BLACKLISTED"
            self.candidates[candidate_address] = json.dumps(cand_obj)
            self._update_tier(candidate_address)

    @gl.public.write
    def generate_interview_questions(self, candidate_address: Address) -> None:
        """Generate 3 technical questions based on skills."""
        cand_addr_str = str(candidate_address)
        if cand_addr_str not in self.candidates:
            raise Exception("Candidate not registered")
        
        status = self.interview_status.get(cand_addr_str, "NOT_STARTED")
        if status != "NOT_STARTED":
            raise Exception("Interview already started or questions generated")
            
        candidate_data = json.loads(self.candidates[cand_addr_str])
        claimed_skills = candidate_data["claimed_skills"]
        
        def leader_fn():
            prompt = f"""You are a technical interviewer. Generate 3 distinct technical interview questions to test the candidate's claimed skills: {claimed_skills}.
Respond with ONLY a JSON object containing a list of strings:
{{
  "questions": [
    "Question 1...",
    "Question 2...",
    "Question 3..."
  ]
}}"""
            # POLICY DECISION: AI technical interviewer generates custom interview questions based on claimed skills
            return gl.nondet.exec_prompt(prompt, response_format="json")

        def validator_fn(leader_result) -> bool:
            try:
                try:
                    raw = leader_result.value
                except Exception:
                    raw = leader_result
                data = robust_json_loads(raw)
                questions = data.get("questions")
                if not isinstance(questions, list) or len(questions) != 3:
                    return False
                for q in questions:
                    if not isinstance(q, str) or len(q.strip()) < 10:
                        return False
                
                # Semantic validator cross-check
                # POLICY DECISION: Validator runs a semantic cross-check using exec_prompt to verify consensus
                cross_prompt = f"Check if these questions are relevant to {claimed_skills}: {', '.join(questions)}. Respond with AGREE if they are relevant, and DISAGREE only if they are completely unrelated."
                try:
                    val_res = gl.nondet.exec_prompt(cross_prompt)
                    val_res_upper = val_res.upper()
                    if "DISAGREE" in val_res_upper or "不同意" in val_res_upper:
                        return False
                except Exception:
                    pass
                return True
            except Exception:
                return False

        result_raw = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        result_data = robust_json_loads(result_raw)
        
        # ON-CHAIN STATE UPDATE: Save generated questions and update interview status directly to contract storage
        self.interview_questions[cand_addr_str] = json.dumps(result_data["questions"])
        self.interview_status[cand_addr_str] = "GENERATED"

    @gl.public.write
    def submit_interview_answers(self, candidate_address: Address, answers_list: str) -> None:
        """Submit candidate answers."""
        caller = gl.message.sender_address
        if caller != candidate_address:
            raise Exception("NOT_AUTHORIZED: Only the candidate can submit their answers")
        
        cand_addr_str = str(candidate_address)
        status = self.interview_status.get(cand_addr_str, "NOT_STARTED")
        if status != "GENERATED":
            raise Exception("Interview answers cannot be submitted in status: " + status)
            
        answers = json.loads(answers_list)
        if not isinstance(answers, list) or len(answers) != 3:
            raise Exception("Invalid answers format: must be a list of 3 answers")
            
        self.interview_answers[cand_addr_str] = json.dumps(answers)
        self.interview_status[cand_addr_str] = "ANSWERED"

    @gl.public.write
    def grade_interview(self, candidate_address: Address) -> None:
        """Grade the submitted answers with validator score validation."""
        cand_addr_str = str(candidate_address)
        status = self.interview_status.get(cand_addr_str, "NOT_STARTED")
        if status != "ANSWERED":
            raise Exception("Interview has not been answered yet")
            
        questions_raw = self.interview_questions[cand_addr_str]
        answers_raw = self.interview_answers[cand_addr_str]
        
        def leader_fn():
            prompt = f"""You are a technical examiner. Grade the candidate's answers to the interview questions.
QUESTIONS: {questions_raw}
ANSWERS: {answers_raw}

Respond with ONLY a JSON object containing:
{{
  "score": <integer 0-100>,
  "feedback": "<2-3 sentences explaining the grade>"
}}"""
            # POLICY DECISION: AI technical examiner grades candidate responses
            return gl.nondet.exec_prompt(prompt, response_format="json")

        def validator_fn(leader_result) -> bool:
            try:
                try:
                    raw = leader_result.value
                except Exception:
                    raw = leader_result
                data = robust_json_loads(raw)
                leader_score = data.get("score")
                if not isinstance(leader_score, int) or not (0 <= leader_score <= 100):
                    return False
                feedback = data.get("feedback", "")
                if not isinstance(feedback, str) or len(feedback.strip()) < 10:
                    return False
                return True
            except Exception:
                return False

        result_raw = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        result_data = robust_json_loads(result_raw)
        
        score_val = u256(result_data["score"])
        
        # ON-CHAIN STATE UPDATE: Save interview score and update status in contract storage
        self.interview_score[cand_addr_str] = score_val
        self.interview_status[cand_addr_str] = "GRADED"
        
        # ON-CHAIN STATE UPDATE: Update reputation score and evaluate candidate tier dynamically
        self.reputation_scores[cand_addr_str] = score_val
        self._update_tier(cand_addr_str)

    @gl.public.write
    def create_job_bounty(self, title: str, required_skills: str, bounty_amount: u256) -> u256:
        """Create a job bounty and hold locked escrow funds."""
        employer = str(gl.message.sender_address)
        job_id = self.bounty_counter
        self.bounty_counter = self.bounty_counter + u256(1)
        
        bounty_val = gl.message.value if gl.message.value > u256(0) else bounty_amount
        
        job_data = {
            "id": int(job_id),
            "employer": employer,
            "title": title,
            "required_skills": required_skills,
            "bounty_amount": int(bounty_val),
            "status": "OPEN"
        }
        self.job_bounties[job_id] = json.dumps(job_data)
        self.job_escrow[job_id] = bounty_val
        self.job_applicants[job_id] = json.dumps([])
        
        return job_id

    @gl.public.write
    def cancel_job_bounty(self, job_id: u256) -> None:
        """Refund employer if job bounty remains OPEN."""
        if job_id not in self.job_bounties:
            raise Exception("Job bounty not found")
        job = json.loads(self.job_bounties[job_id])
        employer = job["employer"]
        
        if str(gl.message.sender_address) != employer:
            raise Exception("NOT_AUTHORIZED: Only the job creator can cancel this bounty")
        if job["status"] != "OPEN":
            raise Exception("Job is not open and cannot be cancelled")
            
        escrow = self.job_escrow.get(job_id, u256(0))
        if escrow > u256(0):
            gl.send(gl.message.sender_address, escrow)
            
        job["status"] = "CANCELLED"
        self.job_bounties[job_id] = json.dumps(job)
        self.job_escrow[job_id] = u256(0)

    @gl.public.write
    def apply_to_job_bounty(self, job_id: u256) -> None:
        """Apply as a registered candidate."""
        caller = str(gl.message.sender_address)
        if caller not in self.candidates:
            raise Exception("NOT_AUTHORIZED: Must register as candidate to apply")
            
        if job_id not in self.job_bounties:
            raise Exception("Job bounty not found")
        job = json.loads(self.job_bounties[job_id])
        if job["status"] != "OPEN":
            raise Exception("Job is not open for applications")
            
        applicants = json.loads(self.job_applicants.get(job_id, "[]"))
        if caller in applicants:
            raise Exception("ALREADY_APPLIED: You have already applied to this job")
            
        applicants.append(caller)
        self.job_applicants[job_id] = json.dumps(applicants)

    @gl.public.write
    def award_job_bounty(self, job_id: u256, winner_address: Address) -> None:
        """Employer releases job escrow to the winner."""
        if job_id not in self.job_bounties:
            raise Exception("Job bounty not found")
        job = json.loads(self.job_bounties[job_id])
        employer = job["employer"]
        
        if str(gl.message.sender_address) != employer:
            raise Exception("NOT_AUTHORIZED: Only the job creator can award this bounty")
        if job["status"] != "OPEN":
            raise Exception("Job is not open")
            
        winner_str = str(winner_address)
        applicants = json.loads(self.job_applicants.get(job_id, "[]"))
        if winner_str not in applicants:
            raise Exception("INVALID_WINNER: Winner must be one of the job applicants")
            
        escrow = self.job_escrow.get(job_id, u256(0))
        if escrow > u256(0):
            gl.send(winner_address, escrow)
            
        job["status"] = "CLOSED"
        self.job_bounties[job_id] = json.dumps(job)
        self.job_escrow[job_id] = u256(0)

    @gl.public.write
    def submit_appeal(self, reasoning: str) -> None:
        """Submit an appeal against slash/unverified verdict."""
        caller = str(gl.message.sender_address)
        if caller not in self.candidates:
            raise Exception("Must be registered candidate to appeal")
        if self.appeal_used.get(caller, False):
            raise Exception("APPEAL_ALREADY_USED: You can only appeal once per candidate")
            
        appeal_data = {
            "reasoning": reasoning,
            "fee_paid": 100,
            "status": "PENDING"
        }
        self.appeals[caller] = json.dumps(appeal_data)
        self.appeal_used[caller] = True

    @gl.public.write
    def execute_appeal(self, candidate_address: Address) -> None:
        """Consensus execution of an appeal verdict."""
        cand_str = str(candidate_address)
        if cand_str not in self.appeals:
            raise Exception("Appeal not found")
        appeal = json.loads(self.appeals[cand_str])
        if appeal["status"] != "PENDING":
            raise Exception("Appeal already processed")
            
        candidate = json.loads(self.candidates[cand_str])
        github_url = candidate["github_url"]
        portfolio_url = candidate.get("portfolio_url", "")
        claimed_skills = candidate["claimed_skills"]
        appeal_reason = appeal["reasoning"]

        def leader_fn():
            github_content = ""
            try:
                github_content = gl.nondet.web.render(github_url, mode="text")
            except Exception:
                github_content = "GITHUB_UNREADABLE"

            analysis_task = f"""You are a supreme tech credential appeal judge.
The candidate's profile was flagged as fraud or unverified, but they appealed.
CLAIMED SKILLS: {claimed_skills}
GITHUB CONTENT: {github_content[:2000]}
CANDIDATE APPEAL REASONING: {appeal_reason}

Respond with ONLY a JSON object (no markdown):
{{
  "verdict": "VERIFIED" or "PARTIAL" or "UNVERIFIED",
  "reasoning": "<2-3 sentences justifying the decision>"
}}"""
            # POLICY DECISION: Supreme AI judge decides on the appeal case
            return gl.nondet.exec_prompt(analysis_task, response_format="json")

        def validator_fn(leader_result) -> bool:
            try:
                try:
                    raw = leader_result.value
                except Exception:
                    raw = leader_result
                data = robust_json_loads(raw)
                if data.get("verdict") not in {"VERIFIED", "PARTIAL", "UNVERIFIED"}:
                    return False
                reasoning = data.get("reasoning", "")
                if not isinstance(reasoning, str) or len(reasoning.strip()) < 10:
                    return False
                return True
            except Exception:
                return False

        result_raw = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        result_data = robust_json_loads(result_raw)
        
        verdict = result_data["verdict"]
        
        if verdict in ["VERIFIED", "PARTIAL"]:
            # ON-CHAIN STATE UPDATE: Appeal won - restore stake and remove from blacklist
            self.stakes[cand_str] = u256(1000)
            self.staked_amount[cand_str] = u256(1000)
            self.blacklist[cand_str] = False
            
            candidate["status"] = verdict
            self.candidates[cand_str] = json.dumps(candidate)
            
            gl.send(candidate_address, u256(100))
            appeal["status"] = "WON"
        else:
            # ON-CHAIN STATE UPDATE: Appeal lost - appeal status is marked as LOST
            appeal["status"] = "LOST"
            
        self.appeals[cand_str] = json.dumps(appeal)

    @gl.public.write
    def migrate_candidate(self, old_contract_address: Address) -> None:
        """Fallback migration function to onboard old candidates."""
        caller = str(gl.message.sender_address)
        if caller not in self.candidates:
            profile = {
                "name": "Migrated Candidate",
                "claimed_skills": "",
                "github_url": "",
                "portfolio_url": "",
                "leetcode_user": "",
                "stackoverflow_id": "",
                "cv_url": "",
                "registered_at": 0,
                "status": "PENDING"
            }
            self.candidates[caller] = json.dumps(profile)
            self.candidate_tier[caller] = "BRONZE"

    @gl.public.view
    def get_candidate_profile(self, address: Address) -> str:
        addr_str = str(address)
        return self.candidates.get(addr_str, "")

    @gl.public.view
    def get_verification_result(self, address: Address) -> str:
        addr_str = str(address)
        return self.verifications.get(addr_str, "")

    @gl.public.view
    def get_request(self, request_id: str) -> str:
        return self.verification_requests.get(str(request_id), "")

    @gl.public.view
    def get_request_counter(self) -> u256:
        return self.request_counter

    @gl.public.view
    def get_stake(self, address: Address) -> u256:
        addr_str = str(address)
        return self.staked_amount.get(addr_str, u256(0))

    @gl.public.view
    def is_blacklisted(self, address: Address) -> bool:
        addr_str = str(address)
        return self.blacklist.get(addr_str, False)

    @gl.public.view
    def get_reputation_score(self, address: Address) -> u256:
        return self.reputation_scores.get(str(address), u256(0))

    @gl.public.view
    def get_candidate_tier(self, address: Address) -> str:
        return self.candidate_tier.get(str(address), "NONE")

    @gl.public.view
    def get_interview_questions(self, address: Address) -> str:
        return self.interview_questions.get(str(address), "")

    @gl.public.view
    def get_interview_answers(self, address: Address) -> str:
        return self.interview_answers.get(str(address), "")

    @gl.public.view
    def get_interview_score(self, address: Address) -> u256:
        return self.interview_score.get(str(address), u256(0))

    @gl.public.view
    def get_interview_status(self, address: Address) -> str:
        return self.interview_status.get(str(address), "NOT_STARTED")

    @gl.public.view
    def get_job_bounty(self, job_id: u256) -> str:
        return self.job_bounties.get(job_id, "")

    @gl.public.view
    def get_job_escrow(self, job_id: u256) -> u256:
        return self.job_escrow.get(job_id, u256(0))

    @gl.public.view
    def get_job_applicants(self, job_id: u256) -> str:
        return self.job_applicants.get(job_id, "")

    @gl.public.view
    def get_appeal(self, address: Address) -> str:
        return self.appeals.get(str(address), "")

    @gl.public.view
    def get_appeal_used(self, address: Address) -> bool:
        return self.appeal_used.get(str(address), False)

    @gl.public.view
    def get_candidate_full_state(self, address: Address) -> str:
        addr_str = str(address)
        state = {
            "profile": self.candidates.get(addr_str, ""),
            "verification_result": self.verifications.get(addr_str, ""),
            "stake": int(self.staked_amount.get(addr_str, u256(0))),
            "reputation": int(self.reputation_scores.get(addr_str, u256(0))),
            "tier": self.candidate_tier.get(addr_str, "NONE"),
            "interview_status": self.interview_status.get(addr_str, "NOT_STARTED"),
            "interview_questions": self.interview_questions.get(addr_str, ""),
            "interview_answers": self.interview_answers.get(addr_str, ""),
            "interview_score": int(self.interview_score.get(addr_str, u256(0))),
            "appeal": self.appeals.get(addr_str, ""),
            "appeal_used": self.appeal_used.get(addr_str, False),
            "blacklist": self.blacklist.get(addr_str, False)
        }
        return json.dumps(state)

    @gl.public.view
    def get_active_jobs_full(self) -> str:
        jobs = []
        limit = int(self.bounty_counter)
        for i in range(limit):
            job_id = u256(i)
            if job_id in self.job_bounties:
                job_raw = self.job_bounties[job_id]
                if job_raw:
                    job = json.loads(job_raw)
                    job["escrow"] = int(self.job_escrow.get(job_id, u256(0)))
                    job["applicants"] = json.loads(self.job_applicants.get(job_id, "[]"))
                    jobs.append(job)
        return json.dumps(jobs)

    @gl.public.view
    def run_validator_unit_tests(self) -> str:
        class MockReturn:
            def __init__(self, calldata):
                self.calldata = calldata

        claimed_skills = "Python, React"

        def validator_fn(leader_result) -> bool:
            if not hasattr(leader_result, "calldata"):
                return False
            try:
                raw = leader_result.calldata
                data = robust_json_loads(raw)
                if data.get("verdict") not in {"VERIFIED", "PARTIAL", "UNVERIFIED"}:
                    return False
                confidence = data.get("confidence", -1)
                if not isinstance(confidence, int) or not (0 <= confidence <= 100):
                    return False
                if not isinstance(data.get("verified_skills"), list):
                    return False
                if not isinstance(data.get("unverified_skills"), list):
                    return False
                if not isinstance(data.get("fraud_detected"), bool):
                    return False
                reasoning = data.get("reasoning", "")
                if not isinstance(reasoning, str) or len(reasoning.strip()) < 10:
                    return False

                claimed_list = normalize_skills(claimed_skills)
                verified_list = normalize_skills(data.get("verified_skills", []))
                unverified_list = normalize_skills(data.get("unverified_skills", []))
                
                if any(s in unverified_list for s in verified_list):
                    return False
                claimed_set = set(claimed_list)
                if any(s not in claimed_set for s in verified_list + unverified_list):
                    return False
                if set(verified_list + unverified_list) != claimed_set:
                    return False
                if len(claimed_list) > 0 and len(verified_list) == 0 and len(unverified_list) == 0:
                    return False
                
                ratio = len(verified_list) / len(claimed_list) if len(claimed_list) > 0 else 0
                expected_verdict = "UNVERIFIED"
                if ratio >= 0.7:
                    expected_verdict = "VERIFIED"
                elif ratio >= 0.3:
                    expected_verdict = "PARTIAL"
                if data.get("verdict") != expected_verdict:
                    return False

                return True
            except Exception:
                return False

        # Scenario 1: Valid Return.calldata
        r1 = MockReturn('{"verdict": "PARTIAL", "confidence": 50, "verified_skills": ["Python"], "unverified_skills": ["React"], "reasoning": "Python is evidenced, React is not.", "fraud_detected": false}')
        if not validator_fn(r1):
            return "FAILED: Scenario 1 (Valid calldata)"

        # Scenario 2: Malformed JSON
        r2 = MockReturn('{"verdict": "PARTIAL", "confidence": 50')
        if validator_fn(r2):
            return "FAILED: Scenario 2 (Malformed JSON)"

        # Scenario 3: Missing calldata
        class MockInvalid:
            pass
        if validator_fn(MockInvalid()):
            return "FAILED: Scenario 3 (Missing calldata)"

        # Scenario 4: Overlap
        r4 = MockReturn('{"verdict": "VERIFIED", "confidence": 100, "verified_skills": ["Python", "React"], "unverified_skills": ["React"], "reasoning": "Overlap check failed.", "fraud_detected": false}')
        if validator_fn(r4):
            return "FAILED: Scenario 4 (Overlap)"

        # Scenario 5: Extra skills
        r5 = MockReturn('{"verdict": "VERIFIED", "confidence": 100, "verified_skills": ["Python", "React", "Rust"], "unverified_skills": [], "reasoning": "Rust is not claimed.", "fraud_detected": false}')
        if validator_fn(r5):
            return "FAILED: Scenario 5 (Extra skills)"

        # Scenario 6: Both empty
        r6 = MockReturn('{"verdict": "UNVERIFIED", "confidence": 0, "verified_skills": [], "unverified_skills": [], "reasoning": "Both empty check failed.", "fraud_detected": false}')
        if validator_fn(r6):
            return "FAILED: Scenario 6 (Both empty)"

        # Scenario 7: Verdict mismatch
        r7 = MockReturn('{"verdict": "VERIFIED", "confidence": 100, "verified_skills": ["Python"], "unverified_skills": ["React"], "reasoning": "Ratio is 50% but verdict is VERIFIED.", "fraud_detected": false}')
        if validator_fn(r7):
            return "FAILED: Scenario 7 (Verdict mismatch)"

        # Scenario 8: Negative security test: VERIFIED 100 but no evidence
        r8 = MockReturn('{"verdict": "VERIFIED", "confidence": 100, "verified_skills": [], "unverified_skills": ["Python", "React"], "reasoning": "Verified verdict but no verified skills.", "fraud_detected": false}')
        if validator_fn(r8):
            return "FAILED: Scenario 8 (Negative security test)"

        return "PASSED"
