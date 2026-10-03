#!/bin/bash
# Re-record all three tutorial videos (each writes real rows to the live DB; plates/usernames must be fresh)
PY="/c/Users/Tim/AppData/Local/Python/pythoncore-3.14-64/python.exe"
export PYTHONIOENCODING=utf-8
cd "$(dirname "$0")"
$PY tutorial_book_in.py DEMO127GP 2>&1 | grep -E "Recorded|Converted|Error|Traceback" ; echo "--- book-in done"
$PY tutorial_new_workshop.py 2>&1 | grep -E "Username|Location|Recorded|Converted|Error|Traceback"; echo "--- new-workshop done"
$PY tutorial_match_vehicle.py 2>&1 | grep -E "Recorded|Converted|Error|Traceback"; echo "--- match done"
