# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json

# CredChain — Decentralized CV Verification & Hiring Bond Platform
# Phase 1: Candidate registration and stake bond logic


class Contract(gl.Contract):
    candidates: TreeMap[str, str]             # address → JSON candidate profile
    stakes: TreeMap[str, u256]                # address → staked amount
    verifications: TreeMap[str, str]          # address → JSON verification result
    blacklist: TreeMap[str, bool]             # address → True if slashed
    verification_requests: TreeMap[str, str]  # request_id → JSON request metadata
    request_counter: u256                     # auto-increment ID

    def __init__(self):
        # RULE #2: Only primitive types initialized here.
        # TreeMap auto-initialized empty by GenVM.
        self.request_counter = u256(0)

    @gl.public.write
    def register_candidate(
        self,
        name: str,
        claimed_skills: str,
        github_url: str,
        portfolio_url: str
    ) -> None:
        """Register a candidate with their skill claims and evidence URLs."""
        caller = str(gl.message.sender_address)

        if caller in self.blacklist and self.blacklist[caller]:
            raise Exception("Caller is blacklisted and cannot re-register")

        profile = {
            "name": name,
            "claimed_skills": claimed_skills,
            "github_url": github_url,
            "portfolio_url": portfolio_url,
            "registered_at": int(gl.message.timestamp),
            "status": "PENDING"
        }
        self.candidates[caller] = json.dumps(profile)

    @gl.public.write
    def stake_bond(self, amount: u256) -> None:
        """Stake a reputation bond. Forfeited if fraud is detected."""
        caller = str(gl.message.sender_address)

        if caller not in self.candidates:
            raise Exception("Must register as candidate before staking")

        if self.blacklist.get(caller, False):
            raise Exception("Blacklisted candidates cannot stake")

        existing = self.stakes.get(caller, u256(0))
        self.stakes[caller] = existing + amount

    @gl.public.view
    def get_candidate_profile(self, address: str) -> str:
        return self.candidates.get(address, "")

    @gl.public.view
    def get_stake(self, address: str) -> u256:
        return self.stakes.get(address, u256(0))

    @gl.public.view
    def is_blacklisted(self, address: str) -> bool:
        return self.blacklist.get(address, False)
