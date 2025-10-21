set -o allexport; source .env; set +o allexport

# 
az webapp config set --name $AZURE_WEBAPP_NAME --resource-group $AZURE_RESOURCE_GROUP --startup-file "npm start"

# Configure persistent storage for uploads directory
az webapp config appsettings set --name $AZURE_WEBAPP_NAME --resource-group $AZURE_RESOURCE_GROUP --settings WEBSITES_ENABLE_APP_SERVICE_STORAGE=true

echo "Azure Web App configuration completed."
echo "Note: The uploads directory will be created automatically when the first file is uploaded."

