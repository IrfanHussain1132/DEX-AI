import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, URL, text
from sqlalchemy.exc import SQLAlchemyError

load_dotenv()

DATABASE_URL = URL.create(
    drivername="mysql+mysqlconnector",
    username=os.getenv("MYSQL_USER"),
    password=os.getenv("MYSQL_PASSWORD"),
    host=os.getenv("MYSQL_HOST"),
    port=int(os.getenv("MYSQL_PORT", 3306)),
    database=os.getenv("MYSQL_DATABASE")
)

engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,
    pool_recycle=3600
)

def get_connection():
    try:
        connection = engine.connect()
        print("MySQL connection successful!")
        return connection

    except SQLAlchemyError as e:
        print("Database connection failed:", e)
        return None


if __name__ == "__main__":
    connection = get_connection()

    if connection:
        result = connection.execute(text("SELECT DATABASE()"))
        print("Connected database:", result.scalar())
        connection.close()