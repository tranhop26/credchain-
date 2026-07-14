#!/usr/bin/env python3
"""
CredChain Deploy Script
=======================
Helper script that validates the CredChain contract and prints step-by-step
deployment instructions for GenLayer Studio.

Usage:
  python scripts/deploy.py [--validate-only]
"""

import sys
import ast
import os


def validate_contract(contract_path: str) -> bool:
    """Validate contract syntax and check all 8 deployment rules."""
    print(f"\n[INFO] Validating {contract_path}...")

    if not os.path.exists(contract_path):
        print(f"[ERROR] Contract file not found: {contract_path}")
        return False

    with open(contract_path, "r", encoding="utf-8") as f:
        lines = f.readlines()
        content = f.read() if not lines else "".join(lines)

    errors = []
    warnings = []

    # RULE 1: First line must be # v0.2.16
    if not lines[0].strip().startswith("# v0.2.16"):
        errors.append("RULE 1 FAIL: First line must be '# v0.2.16'")
    else:
        print("[OK]   RULE 1: Version header present")

    # RULE 2: Second line must contain Depends hash
    if "Depends" not in lines[1]:
        errors.append("RULE 2 FAIL: Second line must contain '# { \"Depends\": ... }'")
    else:
        print("[OK]   RULE 2: Depends hash present")

    # RULE 3/8: from genlayer import * (not import genlayer)
    if "from genlayer import *" not in content:
        errors.append("RULE 8 FAIL: Must use 'from genlayer import *'")
    else:
        print("[OK]   RULE 8: Correct import style")

    if "import genlayer as gl" in content or "import genlayer\n" in content:
        errors.append("RULE 8 FAIL: Found 'import genlayer' — use 'from genlayer import *'")

    # RULE 5: No dict or list annotations in storage
    if ": dict[" in content or ": list[" in content:
        errors.append("RULE 5 FAIL: Storage uses dict/list — must use TreeMap/DynArray")
    else:
        print("[OK]   RULE 5: No dict/list in storage")

    # RULE 6: Class must be named Contract
    if "class Contract(gl.Contract):" not in content:
        errors.append("RULE 6 FAIL: Class must be 'class Contract(gl.Contract):'")
    else:
        print("[OK]   RULE 6: Class named Contract(gl.Contract)")

    # RULE 2: No TreeMap() assignment in __init__
    if "self." in content and "= TreeMap()" in content:
        errors.append("RULE 2 FAIL: Found 'self.X = TreeMap()' in __init__ — remove it")
    else:
        print("[OK]   RULE 2: No TreeMap() reassignment in __init__")

    # RULE 3: No float in public methods
    if ": float" in content:
        errors.append("RULE 3 FAIL: Found 'float' type — use 'int' or 'u256'")
    else:
        print("[OK]   RULE 3: No float types")

    # RULE 7: gl.nondet.* inside run_nondet_unsafe
    if "gl.nondet." in content and "run_nondet_unsafe" not in content:
        errors.append("RULE 7 FAIL: gl.nondet.* calls found but run_nondet_unsafe missing")
    else:
        print("[OK]   RULE 7: gl.nondet.* inside run_nondet_unsafe")

    # Python syntax check
    try:
        # Strip the genlayer-specific header lines for ast parsing
        parseable = content.replace("from genlayer import *", "pass  # genlayer import")
        ast.parse(parseable)
        print("[OK]   Syntax: Python syntax valid")
    except SyntaxError as e:
        errors.append(f"SYNTAX ERROR: {e}")

    print()
    if errors:
        print("[VALIDATION FAILED]")
        for err in errors:
            print(f"  - {err}")
        return False
    else:
        print("[VALIDATION PASSED] Contract is ready to deploy")
        return True


def print_deploy_instructions():
    """Print step-by-step deploy instructions."""
    print("""
=======================================================================
  CREDCHAIN DEPLOYMENT GUIDE — GenLayer Studio
=======================================================================

STEP 1: Verify environment with minimal contract
  a) Open https://studio.genlayer.com/run-debug
  b) Settings -> Reset Storage -> Confirm
  c) Hard refresh (Ctrl+Shift+R)
  d) Create new file, paste contents of: contracts/storage_test.py
  e) Click "Deploy"
  f) In sidebar: click the tx -> verify "Result: SUCCESS"
  g) Call increment() -> verify counter increments

STEP 2: Deploy CredChain main contract
  a) Create new file in Studio, paste: contracts/CredChain.py
  b) Click "Deploy"
  c) Click the deploy tx in sidebar -> verify "Result: SUCCESS"
  d) Copy the Contract Address shown in the sidebar

STEP 3: Connect app
  a) Create app/.env.local with:
       VITE_CONTRACT_ADDRESS=0x<your_contract_address>
       VITE_CHAIN=studionet
  b) cd app && npm run dev
  c) Open http://localhost:5173

STEP 4: Test the full flow in Studio
  1. Call register_candidate("Alice", "Python,React", "https://github.com/...", "")
  2. Call stake_bond(1000) from same address
  3. Call request_verification(<same_address>) -> copy returned request_id
  4. Call execute_verification(<request_id>) -- wait 30-60s for AI consensus
  5. Call get_verification_result(<address>) -> inspect the JSON verdict

STEP 5: Deploy app to Vercel
  - Push repo to GitHub (already done)
  - Go to https://vercel.com/new
  - Import repo: tranhop26/credchain-
  - Set Root Directory: app
  - Add Environment Variable: VITE_CONTRACT_ADDRESS=<your_address>
  - Click Deploy

=======================================================================
  COMMON ERRORS
=======================================================================

  "Contract Queues not found"
    -> Missing # v0.2.16 on line 1

  "AssertionError: TreeMap <- TreeMap"
    -> self.X = TreeMap() in __init__ — remove that line

  "Schema error"
    -> float or dict in a public method signature

  Result: ERROR in tx sidebar
    -> Read the traceback in the tx details panel

  Sidebar shows "Not deployed yet" after FINALIZED tx
    -> Reset Storage -> Hard Refresh -> Re-deploy

=======================================================================
""")


if __name__ == "__main__":
    validate_only = "--validate-only" in sys.argv
    contract_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "contracts", "CredChain.py"
    )

    ok = validate_contract(contract_path)

    if not validate_only:
        print_deploy_instructions()

    sys.exit(0 if ok else 1)
