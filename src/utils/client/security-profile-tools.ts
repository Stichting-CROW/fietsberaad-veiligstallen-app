import { VSUserSecurityProfile, VSCRUDRight, VSSecurityTopic } from "~/types/securityprofile";

export const allowNone: VSCRUDRight = {
  create: false,
  read: false,
  update: false,
  delete: false
};
export const allowCRUD: VSCRUDRight = {
  create: true,
  read: true,
  update: true,
  delete: true
};
export const allowRead: VSCRUDRight = {
  create: false,
  read: true,
  update: false,
  delete: false
};
export const allowReadUpdate: VSCRUDRight = {
  create: false,
  read: true,
  update: true,
  delete: false
};

export const getSecurityRights = (securityprofile: VSUserSecurityProfile | undefined, topic: VSSecurityTopic): VSCRUDRight => {
  if(!securityprofile) {
    return allowNone;
  }

  return securityprofile.rights[topic] || allowNone;
}