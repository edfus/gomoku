#!/bin/sh

set -e

set +e # tolerate network lag
git submodule update --recursive --init
git submodule update --recursive --remote
set -e

readonly __dirname=$(dirname "$(readlink -f "$0")")
readonly DOMAIN_HOSTNAME=$(basename "$__dirname")

sed -i "s/localhost/${DOMAIN_HOSTNAME}/g" "${__dirname}/.env"

readonly redis_users="limit-api%web-gateway limit-bot-messaging%stalker"
readonly secrets_path="${__dirname}/secrets"

readonly acl_filepath="${secrets_path}/redis-acl-file"
readonly password_suffix="-redis-password"

truncate -s 0 ${acl_filepath}
for keyprefix_and_modulename in $redis_users; do
  keyprefix="$(echo $keyprefix_and_modulename | cut -d'%' -f1)"
  modulename="$(echo $keyprefix_and_modulename | cut -d'%' -f2)"

  password=$(cat /dev/urandom | head -c 48 | base64)

  echo "user ${modulename} on +@all -DEBUG ~${keyprefix}:* >${password}">>${acl_filepath}
  echo -n ${password}>"${secrets_path}/${modulename}${password_suffix}"
  echo ${modulename}${password_suffix} generated
done;

cat>"${secrets_path}/web-gateway-primary-admin-token.mjs"<<EOF
export default {
  key: "$(head -c 24 </dev/urandom | base64)",
  secret: "$(head -c 32 </dev/urandom | base64)"
}
EOF

echo -n $(cat /dev/urandom | head -c 48 | base64)>"${secrets_path}/caddy-kibana-endpoint-password"

sudo chown root:root "$secrets_path"
sudo chmod 700 "$secrets_path"

sudo chmod +x "$__dirname/caddy/health-check.sh"
sudo chmod +x "$__dirname/caddy/init.sh"
sudo chmod +x "$__dirname/apps/health-check-stalker.sh"
sudo chmod +x "$__dirname/web-gateway/health-check.sh"

if [ -n "/etc/docker/daemon.json" ]; then
cp "$__dirname/daemon.json" "/etc/docker/daemon.json"
fi