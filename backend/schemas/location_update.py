from sqlmodel import SQLModel


class LocationRename(SQLModel):
    """Request body for renaming a location."""
    new_name: str
