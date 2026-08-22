import re

file_path = "c:/Users/user/Desktop/vortex english/server.js"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

pattern = r'(if \(req\.method === "(?:GET|POST|DELETE)" && pathname.*?"/api/teacher/.*?"\)? \{\s*const user = studentFromRequest\(req, data\);\s*if \(!user\) return json\(res, 401, \{ error: "Please sign in\." \}\);)'
replacement = r"\1\n    if (user.role !== 'teacher') return json(res, 403, { error: 'Teacher access required' });"

new_content = re.sub(pattern, replacement, content)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(new_content)

print(f"Replaced {content.count('/api/teacher/')} possible instances.")
