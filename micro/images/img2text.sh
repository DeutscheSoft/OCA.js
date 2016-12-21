#!/bin/bash
if [ "$1" = "" ]; then
    echo "Usage: ./img2text.sh [source] [destination] [var name]"
    exit 1
fi

a=0
b=0

echo "$3 = [" > "$2"
echo -n "    [" >> "$2"

convert "$1" -depth 2 txt:- |
    tail -n +2 |
    tr -cs '0-9.\n'  ' ' |
    while read x y z q w e r t; do
        if [ $x -lt $a ]; then
            echo "]," >> "$2"
            echo -n "    [" >> "$2"
        fi
        if [ $z -gt 0 ]; then
            echo -n 1, >> "$2"
        else
            echo -n 0, >> "$2"
        fi
        a=$x
    done
echo "]" >> "$2"
echo "]" >> "$2"
