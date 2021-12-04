#!/bin/bash

set -e

readonly __dirname=$(dirname "$(readlink -f "$0")")

cd "$__dirname"

read -e -p "Publish? (y/n)" -i " n" IS_PUBLISH
IS_PUBLISH=$(echo ${IS_PUBLISH} | sed '/^\s*$/d')

if [ $IS_PUBLISH == "y" ]; then
  wrangler publish --env production
else
  wrangler preview
fi