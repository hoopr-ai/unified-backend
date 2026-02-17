
export const enum ErrorMessages {
    IncorrectPassword = "Incorrect password",
    UserNotFound = "User details not found.",
    SamePassword = "New password cannot be the same as the old password",
    UserAlreadyExists = "User with given email already exists.",
    AlbumNotFound = "Album not found.",
    InsufficientTokens = "Insufficient tokens. Please contact your administrator to add more tokens.",
    TrackNotFound = "Track not found.",
    TrackDownloadLinkNotAvailable = "Track download link not available.",
    UserNotAssociatedWithBrand = "User is not associated with any brand.",
    BrandNotFound = "Brand not found.",
    InvalidTokenAmount = "Token amount must be greater than 0.",
    ProfileAlreadyComplete = "Profile is already complete.",
    CannotRemoveAdmin = "Cannot remove an admin or master user.",
    CannotRemoveSelf = "You cannot remove yourself.",
    UserNotInBrand = "User does not belong to your brand.",
}