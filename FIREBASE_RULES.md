# Firebase Security Rules

Here are the complete security rules for your Dealer Ledger Pro application. Copy and paste these into the appropriate sections of your Firebase project console as described in `FIREBASE_SETUP.md`.

---

## Realtime Database Rules

**Copy this code into:** `Realtime Database > Rules`

These rules ensure that a user can only access their own company's data, but a designated admin user has the ability to create new companies for other users.

```json
{
  "rules": {
    "users": {
      "$uid": {
        // A user can read/write their own record. The admin can read/write any user record.
        ".read": "auth != null && (auth.uid == $uid || auth.uid == 'lxfhLVwuqxOFmBX1me8QUNMoBo42')",
        ".write": "auth != null && (auth.uid == $uid || auth.uid == 'lxfhLVwuqxOFmBX1me8QUNMoBo42')"
      }
    },
    "companies": {
      "$companyId": {
        // READ is allowed if the user's companyId matches the one they are trying to read.
        ".read": "auth != null && root.child('users').child(auth.uid).child('companyId').val() == $companyId",
        
        // WRITE is allowed if the user is a member of that company OR if they are the admin.
        // The admin permission is what allows the provisioning of new accounts.
        ".write": "auth != null && (root.child('companies').child($companyId).child('users').child(auth.uid).exists() || auth.uid == 'lxfhLVwuqxOFmBX1me8QUNMoBo42')"
      }
    },
    // By default, no other top-level paths are readable or writable.
    ".read": false,
    ".write": false
  }
}
```

---

## Cloud Storage Rules

**Copy this code into:** `Storage > Rules`

These rules protect your file uploads. They ensure a user can only upload files into their own folder and can only view files that belong to their company. **Applying these rules will fix the "Write permission denied" error.**

```
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    
    // The path structure is: {companyId}/{userId}/{folder}/{fileName}
    // e.g., -OD...xyz/HH...1b3/receipts/scan_123.jpg
    match /{companyId}/{userId}/{path=**} {
      
      // Function to verify that the user requesting access belongs to the company
      // specified in the file path. It does this by checking the Realtime Database.
      function isUserInCompany() {
        return get(/databases/(default)/data/users/$(request.auth.uid)/companyId).data == companyId;
      }

      // READ access is granted if the user is authenticated and is a member of the company.
      // This allows any user within a company to view files, which is suitable for a single-user-per-company model.
      allow read: if request.auth != null && isUserInCompany();

      // WRITE access (create, update, delete) is more restrictive.
      // It's only granted if the user is authenticated, belongs to the company,
      // AND is writing to their own designated user folder. This prevents cross-user writing.
      allow write: if request.auth != null && request.auth.uid == userId && isUserInCompany();
    }
  }
}
```