@echo off
echo === Removing old git history completely ===
rmdir /s /q .git

echo === Initializing fresh git repo ===
C:\ProgRa~1\Git\bin\git.exe init
C:\ProgRa~1\Git\bin\git.exe branch -M main

echo === Configuring git user ===
C:\ProgRa~1\Git\bin\git.exe config user.email "nanajinani@github.com"
C:\ProgRa~1\Git\bin\git.exe config user.name "Nanajinani"

echo === Adding all files ===
C:\ProgRa~1\Git\bin\git.exe add .

echo === Creating clean commit ===
C:\ProgRa~1\Git\bin\git.exe commit -m "Initial commit: AegisMod AI Content Moderation System"

echo === Adding remote ===
C:\ProgRa~1\Git\bin\git.exe remote add origin https://github.com/Nanajinani/aegismod.git

echo === Pushing to GitHub ===
C:\ProgRa~1\Git\bin\git.exe push -u origin main --force

echo === Done ===
