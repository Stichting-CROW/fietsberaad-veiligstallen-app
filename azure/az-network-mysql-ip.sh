set -o allexport; source .env; set +o allexport

az network private-dns zone list -o table

# copy private dns zone for the mysql server that you want the IP address for
# from the command output of the previous command
SET PRIVATE_DNS_ZONE_NAME = vst-eu-acc-msql01.mysql.database.azure.com


az network private-dns record-set a list \
  -g $AZURE_RESOURCE_GROUP \
  -z $PRIVATE_DNS_ZONE_NAME