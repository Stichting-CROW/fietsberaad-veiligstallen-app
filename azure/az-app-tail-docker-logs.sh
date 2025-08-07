set -o allexport; source .env; set +o allexport

# az webapp log tail --name $AZURE_WEBAPP_NAME --resource-group $AZURE_RESOURCE_GROUP 
az webapp log tail -n 100000 \
    --name $AZURE_WEBAPP_NAME \
    --resource-group $AZURE_RESOURCE_GROUP

