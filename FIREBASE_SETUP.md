# Firebase Setup Guide

Follow these steps to secure your Firebase backend. The rules live in the rule files (`database.rules.json` and `storage.rules`), which `firebase.json` wires up for deployment.

For your convenience, the full rules are also laid out in the `FIREBASE_RULES.md` file.

## Deploying the rules (recommended)

`firebase.json` points the Firebase CLI at both rule files, so one command publishes them:

    firebase deploy --only database,storage

## 1. Realtime Database Security Rules

These rules ensure that users can only access the data for the company they belong to, that a user's `companyId` link cannot be repointed once provisioned, and that subscription/billing metadata is admin-only.

1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Select your project (`motor-ledger-pro`).
3.  In the left-hand "Build" menu, click on **Realtime Database**.
4.  Click on the **Rules** tab at the top.
5.  Delete all the existing text in the editor.
6.  Open the `database.rules.json` file from this project.
7.  Copy the entire content of `database.rules.json` and paste it into the editor in the Firebase console.
8.  Click the **Publish** button.

## 2. Storage Security Rules

**This is the step required to fix the "Write permission denied" error.** These rules ensure that users can only upload, read, and delete files within their company's storage folder.

1.  Go to the [Firebase Console](https://console.firebase.google.com/).
2.  Select your project (`motor-ledger-pro`).
3.  In the left-hand "Build" menu, click on **Storage**.
4.  Click on the **Rules** tab at the top.
5.  Delete all the existing text in the editor.
6.  Open the `storage.rules` file from this project.
7.  Copy the entire content of `storage.rules` and paste it into the editor in the Firebase console.
8.  Click the **Publish** button.

Your Firebase backend is now configured and secure. After publishing these rules, the "Storage Health Check" in the app's settings should pass.
