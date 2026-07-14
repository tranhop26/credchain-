import json

s = '{"confidence":40"fraud_detected":false"reasoning":"Python is weakly evidenced by a forked \'Robothon-starter\' repository listed as Python on GitHub, though no original Python code authored by the candidate is directly visible. React skill is unverified — the portfolio project (PactKeeper) appears to use JavaScript/GenLayer and no React-specific repositories or components are identified; TypeScript repositories (diagramforge, diagramforge-2) could potentially involve React but there is no explicit confirmation. The evidence base is too thin and largely forked/minimal to strongly verify either claimed skill.""unverified_skills":["React",]"verdict":"PARTIAL""verified_skills":["Python",]}'

def robust_json_loads(s) -> dict:
    s_clean = s.strip()
    cleaned = s_clean
    for _ in range(10):
        cleaned = cleaned.replace(', ]', ']').replace(',]', ']')
        cleaned = cleaned.replace(', }', '}').replace(',}', '}')
        
    keys = ['verdict', 'confidence', 'verified_skills', 'unverified_skills', 'reasoning', 'fraud_detected', 'agree']
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
                    cleaned = cleaned[:idx] + ',' + cleaned[idx:]
                    idx += 2
                    continue
            idx += 1
            
    print("Cleaned string:", cleaned)
    return json.loads(cleaned)

try:
    res = robust_json_loads(s)
    print('SUCCESS:', res)
except Exception as e:
    print('FAILED:', e)
