Adversary Shield — Setup & Access Guide
Prerequisites
Download all project files including the dataset CSV files and the Test_inject folder before proceeding.
Setup Steps
1. Prepare the dataset
Run GP2.py to process and load the model before starting the application.
2. Configure email for OTP
In app.py, locate the email configuration section and insert your Gmail address and your 16-character app password — this is generated from your Google account under Two-Factor Authentication → App Passwords.
In script.js, locate the email field and update it with the same Gmail address so OTP codes are sent to you correctly.
3. Start the application
Run app.py to launch the backend server, then open the interface in your browser.

Signing In
Enter your credentials based on your role, then verify your identity using the OTP code sent to your email.
RoleUsernamePasswordSOC AnalystsocSoc@12345!Compliance OfficercmpCmp@12345!End UsereuserEuser@12345!

Testing the System
Once logged in, use the Live Demo button to automatically generate simulated network traffic and attack events — no manual data injection needed. This allows you to explore all system features, dashboards, alerts, and reports in real time without requiring a live network environment.
