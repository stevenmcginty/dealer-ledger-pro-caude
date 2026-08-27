# Firebase Security Rules

Here are the complete security rules for your Dealer Ledger Pro application. The rules are deployed from the rule files themselves (`database.rules.json` and `storage.rules`) via `firebase deploy --only database,storage` (see `firebase.json`), or you can copy and paste them into the appropriate sections of your Firebase project console as described in `FIREBASE_SETUP.md`.

The admin user's UID (`lxfhLVwuqxOFmBX1me8QUNMoBo42`) is hardcoded below. It must match `VITE_ADMIN_UID` in `.env.local` (see `config.ts`).

---

## Realtime Database Rules

**Source of truth:** `database.rules.json`

These rules ensure that a user can only access their own company's data, that a user's `companyId` link cannot be repointed once provisioned, and that subscription/billing metadata can only be changed by the admin user.

```json
{
  "rules": {
    ".read": false,
    ".write": false,

    "users": {
      "$uid": {
        // A user can read their own record. The admin can read any user record.
        ".read": "auth != null && (auth.uid == $uid || auth.uid == 'lxfhLVwuqxOFmBX1me8QUNMoBo42')",

        // Only the admin may write user records. Client code never writes its own
        // user node (accounts are provisioned by the admin via the admin panel —
        // see provisionAccountForNewUser in services/dataService.ts), and admin-only
        // writes are what makes the companyId immutability below airtight:
        // .validate is ignored on deletes, so a self-writer could otherwise delete
        // and recreate their companyId pointing at another company.
        ".write": "auth != null && auth.uid == 'lxfhLVwuqxOFmBX1me8QUNMoBo42'",

        // companyId is immutable once set.
        "companyId": {
          ".validate": "!data.exists() || newData.val() === data.val()"
        }
      }
    },

    "companies": {
      // Reading the whole /companies tree is admin-only (the admin panel's
      // business list does one read of /companies).
      ".read": "auth != null && auth.uid == 'lxfhLVwuqxOFmBX1me8QUNMoBo42'",
      "$companyId": {
        // READ is allowed if the user's companyId matches the one they are trying to read.
        ".read": "auth != null && root.child('users').child(auth.uid).child('companyId').val() == $companyId",

        // Billing/subscription state is admin-only. Company members can read it
        // (via the $companyId read above) but must not write it.
        "subscription": {
          ".write": "auth != null && auth.uid == 'lxfhLVwuqxOFmBX1me8QUNMoBo42'"
        },
        "featureOverrides": {
          ".write": "auth != null && auth.uid == 'lxfhLVwuqxOFmBX1me8QUNMoBo42'"
        },

        // Company metadata is admin-only once it exists; creation is open so a
        // first write of meta is possible for companies provisioned without it.
        "meta": {
          ".write": "auth != null && (auth.uid == 'lxfhLVwuqxOFmBX1me8QUNMoBo42' || !data.exists())"
        },

        "salesAgent": {
          ".write": "auth != null && (root.child('companies').child($companyId).child('users').child(auth.uid).exists() || auth.uid == 'lxfhLVwuqxOFmBX1me8QUNMoBo42')",
          "conversations": {
            ".read": "auth != null && root.child('salesAgentRouting').child('inboxMembers').child(root.child('users').child(auth.uid).child('companyId').val()).exists() && root.child('salesAgentRouting').child('inboxMembers').child(root.child('users').child(auth.uid).child('companyId').val()).val() === root.child('salesAgentRouting').child('inboxMembers').child($companyId).val()",
            ".write": "auth != null && (root.child('companies').child($companyId).child('users').child(auth.uid).exists() || auth.uid == 'lxfhLVwuqxOFmBX1me8QUNMoBo42' || (root.child('salesAgentRouting').child('inboxMembers').child(root.child('users').child(auth.uid).child('companyId').val()).exists() && root.child('salesAgentRouting').child('inboxMembers').child(root.child('users').child(auth.uid).child('companyId').val()).val() === root.child('salesAgentRouting').child('inboxMembers').child($companyId).val()))"
          }
        },

        "$other": {
          ".write": "auth != null && (root.child('companies').child($companyId).child('users').child(auth.uid).exists() || auth.uid == 'lxfhLVwuqxOFmBX1me8QUNMoBo42')"
        }
      }
    },

    "salesAgentRouting": {
      "inboxMembers": {
        "$companyId": {
          ".read": "auth != null && (root.child('users').child(auth.uid).child('companyId').val() == $companyId || auth.uid == 'lxfhLVwuqxOFmBX1me8QUNMoBo42')"
        }
      },
      "sharedInboxes": {
        "$inboxId": {
          ".read": "auth != null && (auth.uid == 'lxfhLVwuqxOFmBX1me8QUNMoBo42' || (root.child('salesAgentRouting').child('inboxMembers').child(root.child('users').child(auth.uid).child('companyId').val()).exists() && root.child('salesAgentRouting').child('inboxMembers').child(root.child('users').child(auth.uid).child('companyId').val()).val() == $inboxId))"
        }
      }
    },

    "admin": {
      // The admin node (plans, features, activity log, super admins) is fully
      // restricted to the hardcoded admin UID.
      ".read": "auth != null && auth.uid == 'lxfhLVwuqxOFmBX1me8QUNMoBo42'",
      ".write": "auth != null && auth.uid == 'lxfhLVwuqxOFmBX1me8QUNMoBo42'",
      "superAdmins": {
        "$uid": {
          // A signed-in user may read their own superAdmins record (the admin
          // panel checks it on login to verify admin status); the admin can read all.
          ".read": "auth != null && (auth.uid == $uid || auth.uid == 'lxfhLVwuqxOFmBX1me8QUNMoBo42')"
        }
      }
    }
  }
}
```

### How the rules map to the app's flows

- **Account provisioning** (`provisionAccountForNewUser`): run by the signed-in admin, it writes `users/{newUserUid}`, `companies/{companyId}/meta`, `.../users/{newUserUid}`, `.../businessDetails` and `.../expenseCategories` in one multi-path update. Every path is admin-writable, and `users/{uid}/companyId` passes validation because the data doesn't exist yet.
- **Everyday company data** (vehicles, receipts, statements, worksheets, PDIs, CRM, etc.): written by company members under the `$other` rule; read via the `$companyId` read rule keyed on the user's immutable `companyId`.
- **Admin panel**: `admin/plans`, `admin/features`, `admin/activityLog` and `admin/superAdmins` CRUD are admin-UID-only; `getAllBusinesses()` reads `/companies` in one go via the admin-only root read.
- **Server-side functions** (Cloud Functions) use the Admin SDK, which bypasses security rules entirely; they are unaffected by this file.

---

## Cloud Storage Rules

**Source of truth:** `storage.rules`

These rules protect your file uploads. They ensure a user can only upload files into their own folder and can only view files that belong to their company, and they cap ordinary uploads at 25 MB of image or PDF content.

**Always deploy from `storage.rules`, not from the snippet below.** WhatsApp attachments now live under `{companyId}/whatsapp/` (inbound and owner uploads, up to 200 MB). Legacy objects may still sit at `{companyId}/{userId}/whatsapp/` and `{companyId}/salesAgent/whatsapp/`. Shared-inbox peers may read and delete WhatsApp files on each other's ledgers; only a member of that company may create. A nightly prune caps WhatsApp media at 500 MB per company. The pasted rules below are the generic company-file rules only.

The `{companyId}` path segment can be trusted because the Realtime Database rules above pin `users/{uid}/companyId` — a signed-in user cannot repoint it at another company to reach that company's files.

```
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {

    // The path structure is: {companyId}/{userId}/{folder}/{fileName}
    // e.g. -OD...xyz/HH...1b3/receipts/scan_123.jpg
    match /{companyId}/{userId}/{path=**} {

      // Function to verify that the user requesting access belongs to the company
      // specified in the file path. It does this by checking the Realtime Database.
      function isUserInCompany() {
        return get(/databases/(default)/data/users/$(request.auth.uid)/companyId).data == companyId;
      }

      // READ access is granted if the user is authenticated and is a member of the company.
      allow read: if request.auth != null && isUserInCompany();

      // WRITE access (create, update) is granted if the user is authenticated,
      // belongs to the company, AND is writing to their own designated user folder.
      // Limits: under 25MB, images or PDFs only. application/octet-stream (and an
      // empty type) are also allowed because the filing-cabinet restore flow
      // re-uploads blobs unpacked from a zip, whose MIME type the SDK cannot recover.
      allow create, update: if request.auth != null && request.auth.uid == userId && isUserInCompany()
        && request.resource.size < 25 * 1024 * 1024
        && (request.resource.contentType.matches('image/.*')
            || request.resource.contentType.matches('application/pdf')
            || request.resource.contentType == 'application/octet-stream'
            || request.resource.contentType == '');

      // DELETE keeps the same ownership scoping; size and type limits do not
      // apply to deletes (request.resource is not available for them).
      allow delete: if request.auth != null && request.auth.uid == userId && isUserInCompany();
    }
  }
}
```

### Notes on the storage rules

- Uploads go through `uploadFile()`/`uploadBlob()` in `services/dataService.ts`, which build the path as `{companyId}/{userId}/{folder}/{fileName}` — the rules match that shape.
- In a company with several members, a member can only **delete** files in their own user folder, even though they can read all company files. Deleting another member's file (for example when deleting a receipt they uploaded) will be denied; that is the trade-off of the per-user write scoping.
- Storage download URLs (the `getDownloadURL()` links stored on receipts, invoices and canvas items) contain a token and are served directly by `https://firebasestorage.googleapis.com`; the app's Content-Security-Policy (see `firebase.json`) allows loading images from that origin.
