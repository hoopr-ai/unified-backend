
export enum UserStatus {
    ACTIVE = 'ACTIVE'
}

export enum UserRoles {
    ADMIN = 'ADMIN',
    USER = 'USER',
}

export enum SessionStatus {
    ACTIVE = 'ACTIVE',
    INACTIVE = 'INACTIVE',
    EXPIRED = 'EXPIRED',
}

export enum DeviceType {
    BROWSER = 'BROWSER',
    ANDROID = 'ANDROID',
    IOS = 'IOS',
    DESKTOP = 'DESKTOP',
    OTHER = 'OTHER',
}

export enum ActivityAction {
    LOGIN = 'LOGIN',
    LOGOUT = 'LOGOUT',
    VIEW = 'VIEW',
    CREATE = 'CREATE',
    UPDATE = 'UPDATE',
    DELETE = 'DELETE',
    SEARCH = 'SEARCH',
    EXPORT = 'EXPORT',
    IMPORT = 'IMPORT',
    API_CALL = 'API_CALL',
}

export const SESSION_TIMEOUT_MINUTES = 30;