import sqlite3, json, datetime

db = r'C:\Users\ramya\.local\share\mimocode\mimocode.db'
conn = sqlite3.connect(db)
cur = conn.cursor()

# Search for SECURESIGN specifically
cur.execute("""
    SELECT m.time_created, m.session_id,
           substr(json_extract(p.data, '$.text'), 1, 500) as text_preview
    FROM message m
    JOIN part p ON p.message_id = m.id
    JOIN session s ON s.id = m.session_id
    WHERE s.directory LIKE '%hacktiong%'
      AND json_extract(m.data, '$.role') = 'user'
      AND json_extract(p.data, '$.type') = 'text'
      AND json_extract(p.data, '$.text') LIKE '%SECURE%'
    ORDER BY m.time_created DESC
""")
rows = cur.fetchall()
print(f"=== SECURESIGN mentions ({len(rows)} hits) ===")
for r in rows:
    tc = datetime.datetime.fromtimestamp(r[0]/1000).strftime('%m-%d %H:%M') if r[0] else '?'
    text = (r[2] or '').replace('\n', ' | ')[:350]
    print(f"  [{tc}] {text}")

# Search for "see the image" type messages (branding decisions)
cur.execute("""
    SELECT m.time_created, m.session_id,
           substr(json_extract(p.data, '$.text'), 1, 500) as text_preview
    FROM message m
    JOIN part p ON p.message_id = m.id
    JOIN session s ON s.id = m.session_id
    WHERE s.directory LIKE '%hacktiong%'
      AND json_extract(m.data, '$.role') = 'user'
      AND json_extract(p.data, '$.type') = 'text'
      AND (json_extract(p.data, '$.text') LIKE '%see the image%' OR json_extract(p.data, '$.text') LIKE '%based on image%')
    ORDER BY m.time_created DESC
""")
rows = cur.fetchall()
print(f"\n=== 'see the image' messages ({len(rows)} hits) ===")
for r in rows:
    tc = datetime.datetime.fromtimestamp(r[0]/1000).strftime('%m-%d %H:%M') if r[0] else '?'
    text = (r[2] or '').replace('\n', ' | ')[:300]
    print(f"  [{tc}] {text}")

# Check for the master prompt / brief
cur.execute("""
    SELECT m.time_created, m.session_id,
           substr(json_extract(p.data, '$.text'), 1, 1000) as text_preview
    FROM message m
    JOIN part p ON p.message_id = m.id
    JOIN session s ON s.id = m.session_id
    WHERE s.id = 'ses_096f5258fffetHkgsgu4HeftH5'
      AND json_extract(m.data, '$.role') = 'user'
      AND json_extract(p.data, '$.type') = 'text'
    ORDER BY m.time_created
    LIMIT 3
""")
rows = cur.fetchall()
print(f"\n=== Main session (ses_096f5258ffe) first messages ===")
for r in rows:
    tc = datetime.datetime.fromtimestamp(r[0]/1000).strftime('%m-%d %H:%M') if r[0] else '?'
    text = (r[2] or '').replace('\n', ' | ')[:600]
    print(f"  [{tc}] {text}")

conn.close()
