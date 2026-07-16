# hushvert MCP + Claude Code demo
# Record with:  source ~/.config/secrets.env && export HUSHVERT_API_KEY="$HUSHVERT__API_KEY" && vhs demo.tape
# mcp.json references ${HUSHVERT_API_KEY}, so no secret is ever on screen.

Output out/demo.gif
Output out/demo.mp4

Require claude

Set Shell "bash"
Set FontSize 16
Set Width 1300
Set Height 720
Set Padding 24
Set Margin 14
Set MarginFill "#11111b"
Set BorderRadius 10
Set Theme "Catppuccin Mocha"
Set TypingSpeed 40ms
Set WindowBar Colorful
Set WindowBarSize 34

# --- hidden setup: clean prompt, clean slate ---
Hide
Type "cd /private/tmp/hushvert-demo"
Enter
Type "export PS1='\033[38;5;120m❯\033[0m '"
Enter
Type "rm -f report.pdf; clear"
Enter
Show

Sleep 1500ms

# --- 1. a real Word report, and the server config ---
Type "ls"
Sleep 400ms
Enter
Sleep 1800ms

Type "cat mcp.json"
Sleep 400ms
Enter
Sleep 3500ms

# --- 2. start Claude Code with the hushvert server ---
Type "claude --strict-mcp-config --mcp-config mcp.json"
Sleep 600ms
Enter
Sleep 7s

# --- 3. just ask ---
Type "convert report.docx to PDF with hushvert"
Sleep 1s
Enter

# Real conversion: the agent calls convert_file, uploads, converts, writes the file.
# Sleep first so the TUI is definitely busy ("esc to interrupt"), then wait for it to
# go idle again. Waiting on the screen rather than a fixed sleep means no dead air and
# the recording cannot end mid-conversion, however long the job actually takes.
Sleep 10s
Wait+Screen@180s /\? for shortcuts/
Sleep 4s
