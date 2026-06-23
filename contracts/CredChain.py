# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json

# CredChain — Decentralized CV Verification & Hiring Bond Platform
# Phase 3: Add execute_verification with gl.nondet.web.render to read GitHub on-chain


class Contract(gl.Contract):
    candidates: TreeMap[str, str]
    stakes: TreeMap[str, u256]
    verifications: TreeMap[str, str]
    blacklist: TreeMap[str, bool]
    verification_requests: TreeMap[str, str]
    request_counter: u256

    def __init__(self):
        self.request_counter = u256(0)

    @gl.public.write
    def register_candidate(self, name: str, claimed_skills: str, github_url: str, portfolio_url: str) -> None:
        caller = str(gl.message.sender_address)
        if caller in self.blacklist and self.blacklist[caller]:
            raise Exception("Caller is blacklisted and cannot re-register")
        profile = {
            "name": name, "claimed_skills": claimed_skills,
            "github_url": github_url, "portfolio_url": portfolio_url,
            "registered_at": int(gl.message.timestamp), "status": "PENDING"
        }
        self.candidates[caller] = json.dumps(profile)

    @gl.public.write
    def stake_bond(self, amount: u256) -> None:
        caller = str(gl.message.sender_address)
        if caller not in self.candidates:
            raise Exception("Must register as candidate before staking")
        if self.blacklist.get(caller, False):
            raise Exception("Blacklisted candidates cannot stake")
        existing = self.stakes.get(caller, u256(0))
        self.stakes[caller] = existing + amount

    @gl.public.write
    def request_verification(self, candidate_address: str) -> str:
        if candidate_address not in self.candidates:
            raise Exception("Candidate not registered")
        if self.blacklist.get(candidate_address, False):
            raise Exception("Candidate is blacklisted — verification denied")
        request_id = str(int(self.request_counter))
        self.request_counter = self.request_counter + u256(1)
        request_data = {
            "request_id": request_id,
            "candidate_address": candidate_address,
            "requester": str(gl.message.sender_address),
            "requested_at": int(gl.message.timestamp),
            "status": "PENDING"
        }
        self.verification_requests[request_id] = json.dumps(request_data)
        return request_id

    @gl.public.write
    def execute_verification(self, request_id: str) -> None:
        """
        Core AI verification. RULE #7: ALL gl.nondet.* MUST be inside run_nondet_unsafe.

        Phase 3: Reads GitHub and portfolio URLs on-chain via gl.nondet.web.render.
        Evidence fetching happens here — the contract itself reads live web data,
        not the user. This is what makes GenLayer non-negotiable.
        """
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

        stake_amount = self.stakes.get(candidate_address, u256(0))
        if stake_amount == u256(0):
            raise Exception("Insufficient bond: candidate must stake before verification.")

        candidate = json.loads(self.candidates[candidate_address])
        github_url = candidate["github_url"]
        portfolio_url = candidate.get("portfolio_url", "")
        claimed_skills = candidate["claimed_skills"]

        def leader_fn():
            # Step 1: Read GitHub profile on-chain — Solidity cannot do this
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

            # Step 2: Read portfolio if provided
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
                portfolio_content = "NO_PORTFOLIO_URL"

            # Auto-UNVERIFIED if all sources unreadable (skip exec_prompt)
            if not github_readable and not portfolio_readable:
                auto_result = {
                    "verdict": "UNVERIFIED", "confidence": 0,
                    "verified_skills": [],
                    "unverified_skills": [s.strip() for s in claimed_skills.split(",")],
                    "reasoning": "All evidence sources were inaccessible.",
                    "fraud_detected": False,
                    "evidence_note": "auto_unverified_no_sources"
                }
                return json.dumps(auto_result)

            # Phase 3 placeholder — exec_prompt added in next commit
            placeholder = {
                "verdict": "UNVERIFIED", "confidence": 0,
                "verified_skills": [], "unverified_skills": [],
                "reasoning": "Web content fetched. AI analysis pending.",
                "fraud_detected": False
            }
            return json.dumps(placeholder)

        def validator_fn(leader_result) -> bool:
            if not isinstance(leader_result, gl.vm.Return):
                return False
            try:
                data = json.loads(leader_result.value)
                return data.get("verdict") in {"VERIFIED", "PARTIAL", "UNVERIFIED"}
            except Exception:
                return False

        result_raw = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)
        result_data = json.loads(result_raw)

        req = json.loads(self.verification_requests[request_id])
        candidate_address = req["candidate_address"]
        result_data["verified_at"] = int(gl.message.timestamp)
        self.verifications[candidate_address] = json.dumps(result_data)

        cand_obj = json.loads(self.candidates[candidate_address])
        cand_obj["status"] = result_data["verdict"]
        self.candidates[candidate_address] = json.dumps(cand_obj)

        req["status"] = "DONE"
        self.verification_requests[request_id] = json.dumps(req)

    @gl.public.view
    def get_candidate_profile(self, address: str) -> str:
        return self.candidates.get(address, "")

    @gl.public.view
    def get_verification_result(self, address: str) -> str:
        return self.verifications.get(address, "")

    @gl.public.view
    def get_request(self, request_id: str) -> str:
        return self.verification_requests.get(request_id, "")

    @gl.public.view
    def get_request_counter(self) -> u256:
        return self.request_counter

    @gl.public.view
    def get_stake(self, address: str) -> u256:
        return self.stakes.get(address, u256(0))

    @gl.public.view
    def is_blacklisted(self, address: str) -> bool:
        return self.blacklist.get(address, False)
