#!/bin/bash
# Bundle the lab's call metadata + ratings (no audio, no phone numbers, no keys) -> blob, for analysis off the VM.
set -e
cd /opt/voicelab/data
tar czf /tmp/lab-data.tgz --exclude='*.wav' --exclude='phone-numbers.json' --exclude='phone-dialin*.json' calls ratings.jsonl memory spend.jsonl 2>/dev/null || tar czf /tmp/lab-data.tgz --exclude='*.wav' calls ratings.jsonl
curl -sS -X PUT -H "x-ms-blob-type: BlockBlob" -H "x-ms-version: 2022-11-02" --data-binary @/tmp/lab-data.tgz "https://vpresearchraw1017.blob.core.windows.net/vl-transfer/lab-data.tgz?$SAS" -o /dev/null -w "upload %{http_code}\n"
ls calls | wc -l; wc -l ratings.jsonl
