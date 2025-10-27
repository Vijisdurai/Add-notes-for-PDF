# Add notes for PDF Task

This project is a PDF notes application that allows users to upload, annotate, and manage their PDF documents.

## Table of Contents

- [Project Overview](#project-overview)
- [Tech Stack](#tech-stack)
- [Installation](#installation)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Demonstration](#demonstration)

## Project Overview

The "Add notes for PDF Task" is a web-based application designed to streamline the process of taking and managing notes on PDF files. It features a simple, user-friendly interface for uploading documents and a robust backend to handle file storage and data management.

### Main UI
<img width="1911" height="1023" alt="Screenshot 2025-10-28 040314" src="https://github.com/user-attachments/assets/cb521b8e-93e7-4463-8098-6d1e7de4ed84" />


### File Explorer
<img width="1919" height="1077" alt="Screenshot 2025-10-28 040137" src="https://github.com/user-attachments/assets/77d5d31a-3584-4af0-ade0-4e3a274cab6a" />


## Tech Stack

- **Backend:** Python (FastAPI)
- **Frontend:** HTML, JavaScript, Tailwind CSS
- **PDF Rendering:** PDF.js
- **Database:** SQLite

## Installation

To get started with the development environment, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/your-repository.git
    cd your-repository
    ```

2.  **Set up the backend:**
    - Navigate to the `backend` directory:
      ```bash
      cd backend
      ```
    - Create and activate a virtual environment:
      ```bash
      python -m venv venv
      source venv/bin/activate  # On Windows, use `venv\Scripts\activate`
      ```
    - Install the required dependencies:
      ```bash
      pip install -r requirements.txt
      ```

3.  **Set up the frontend:**
    - The frontend is composed of static files and does not require a build step.

## Usage

1.  **Run the backend server:**
    - From the `backend` directory, run the following command:
      ```bash
      uvicorn main:app --reload
      ```

2.  **Access the application:**
    - Open your web browser and navigate to `http://127.0.0.1:8000`.

## Project Structure

```
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── ...
├── frontend/
│   ├── index.html
│   ├── script.js
│   └── styles.css
├── notes.db
└── README.md
```

## Demonstration

For a complete walkthrough of the application, please see the video demonstration:


https://github.com/user-attachments/assets/1f8cdc05-0ed6-49af-9ce5-23af3b2c0702



