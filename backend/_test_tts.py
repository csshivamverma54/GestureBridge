from routes.text_to_sign import _WORD_LOOKUP, _resolve_tokens, _tokenise

print('Vocabulary size:', len(_WORD_LOOKUP))
print('Sample words:', list(sorted(_WORD_LOOKUP.keys()))[:6])

tokens = _tokenise('hello thank you yes no help')
result = _resolve_tokens(tokens)
for r in result:
    status = 'FOUND' if r['found'] else 'MISSING'
    print(status, r['word'], '->', r['video_id'])
