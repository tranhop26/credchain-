# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json

# CredChain — Decentralized CV Verification & Hiring Bond Platform
# Phase 2: Add request_verification flow with auto-increment request_counter


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
        """
        Employer requests AI verification. Creates PENDING request on-chain.
        Returns request_id string for use with execute_verification().
        """
        if candidate_address not in self.candidates:
            raise Exception("Candidate not registered")

        if self.blacklist.get(candidate_address, False):
            raise Exception("Candidate is blacklisted — verification denied")

        # Auto-increment: each request gets a unique sequential ID
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
