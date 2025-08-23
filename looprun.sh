#!/bin/bash

while true; do
    echo "⏱️ Running script at $(date)" >> loop_log.txt
    ./scriptrun
    sleep 21600  # wait 6 hours (21600 seconds)
done
