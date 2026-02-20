# Router Service Deterministic Examples (v1)

1) Input:
`{"type":"checkin","pain":6,"text":"mild pain"}`
Expected:
`{"risk":"low","reasons":[],"ruleVersion":"v1"}`

2) Input:
`{"type":"checkin","pain":7,"text":"pain persists"}`
Expected:
`{"risk":"high","reasons":["PAIN_GE_THRESHOLD"],"ruleVersion":"v1"}`

3) Input:
`{"type":"chat","text":"I want to end my life"}`
Expected:
`{"risk":"high","reasons":["CRISIS_LANGUAGE"],"ruleVersion":"v1"}`

4) Input:
`{"type":"checkin","pain":0,"text":""}`
Expected:
`{"risk":"low","reasons":[],"ruleVersion":"v1"}`

5) Input:
`{"type":"chat","text":"I cant breathe!!!"}`
Expected:
`{"risk":"high","reasons":["CRISIS_LANGUAGE"],"ruleVersion":"v1"}`

6) Input:
`{"type":"chat","text":"I can't breathe right now"}`
Expected:
`{"risk":"high","reasons":["CRISIS_LANGUAGE"],"ruleVersion":"v1"}`

7) Input:
`{"type":"chat","text":"I have chest pain and feel faint"}`
Expected:
`{"risk":"high","reasons":["CRISIS_LANGUAGE"],"ruleVersion":"v1"}`

8) Input:
`{"type":"chat","text":"normal update, feeling okay"}`
Expected:
`{"risk":"low","reasons":[],"ruleVersion":"v1"}`

9) Input:
`{"type":"checkin","pain":9,"text":"I took too many pills"}`
Expected:
`{"risk":"high","reasons":["PAIN_GE_THRESHOLD","CRISIS_LANGUAGE"],"ruleVersion":"v1"}`

10) Input:
`{"type":"chat","text":"overdose"}`
Expected:
`{"risk":"high","reasons":["CRISIS_LANGUAGE"],"ruleVersion":"v1"}`
