#!/bin/bash
PY="/c/Users/Tim/AppData/Local/Python/pythoncore-3.14-64/python.exe"
export PYTHONIOENCODING=utf-8
cd "$(dirname "$0")"
$PY tutorial_booking_link.py 2>&1 | grep -E "Recorded|Converted|Error|Traceback"; echo "--- booking link done"
$PY tutorial_invite_workshop.py 2>&1 | grep -E "Recorded|Converted|Error|Traceback"; echo "--- invite done"
