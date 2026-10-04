#!/bin/bash
PY="/c/Users/Tim/AppData/Local/Python/pythoncore-3.14-64/python.exe"
export PYTHONIOENCODING=utf-8
cd "$(dirname "$0")"
$PY tutorial_service_reminders.py 2>&1 | grep -E "Recorded|Converted|Error|Traceback"; echo "--- reminders done"
$PY tutorial_time_profit.py 2>&1 | grep -E "Recorded|Converted|Error|Traceback"; echo "--- time/profit done"
