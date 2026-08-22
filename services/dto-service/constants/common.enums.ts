
export enum Platform {
    ENTERPRISE = 'ENTERPRISE',
    /**
     * The consumer creator app. CREATOR is the current name and the one clients
     * should send.
     *
     * It is an ALIAS, not a new platform: `normalizePlatform` folds it onto
     * SOUND_TRACKING_APP before anything touches the database, because that is
     * the value every existing row holds (`users.platform`,
     * `faq_sections.platform`, `featured_tracks.platform`,
     * `user_stream_history.platform`, the native-analytics rollups) and the value
     * every access token issued so far carries. See ./platform.ts.
     */
    CREATOR = 'CREATOR',
    /**
     * The stored spelling of CREATOR. Still accepted on input and still what is
     * written, so no data migration and no already-issued token is invalidated.
     * Prefer Platform.CREATOR in new code.
     *
     * @deprecated Use Platform.CREATOR.
     */
    SOUND_TRACKING_APP = 'SOUND_TRACKING_APP',
    INTERNAL = 'INTERNAL',
    STUDIO = 'STUDIO',
}

export enum HttpStatusCode {
    OK = 200,
    CREATED = 201,
    ACCEPTED = 202,
    BAD_REQUEST = 400,
    UNAUTHORIZED = 401,
    FORBIDDEN = 403,
    NOT_FOUND = 404,
    CONFLICT = 409,
    TOO_MANY_REQUESTS = 429,
    INTERNAL_SERVER_ERROR = 500,
    BAD_GATEWAY = 502,
}