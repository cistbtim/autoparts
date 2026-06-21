import os
import pickle
import requests
from googleapiclient.discovery import build
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request

# ==============================================================================
# CONFIGURATION
# ==============================================================================
GDRIVE_FOLDER_ID  = "1V8p-3JGiWKG80F0ccOLhQJKf7AvtqT_f"
OAUTH_CLIENT_FILE = r"C:\Users\Tim\Desktop\oauth_client.json"
TOKEN_FILE        = r"C:\Users\Tim\Desktop\gdrive_token.pkl"

SUPABASE_URL = "https://lskouiyvdngdzaquurhk.supabase.co"
SUPABASE_KEY = "sb_publishable_De4neqOoFn1wFyiVzaNT0A_HzPAE3YW"

SCOPES = ["https://www.googleapis.com/auth/drive"]   # needs delete permission

DRY_RUN = False   # ← set False to actually delete files and update Supabase
# ==============================================================================

SB_HEADERS = {
    "apikey":        SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type":  "application/json",
    "Prefer":        "return=minimal",
}


def get_drive_service():
    creds = None
    if os.path.exists(TOKEN_FILE):
        with open(TOKEN_FILE, "rb") as f:
            creds = pickle.load(f)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(OAUTH_CLIENT_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE, "wb") as f:
            pickle.dump(creds, f)
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def list_drive_files(drive):
    """Return dict of {part_no: file_id} for all PNGs in the Drive folder."""
    files = {}
    page_token = None
    while True:
        params = {
            "q": f"'{GDRIVE_FOLDER_ID}' in parents and mimeType='image/png' and trashed=false",
            "fields": "nextPageToken, files(id, name)",
            "pageSize": 1000,
        }
        if page_token:
            params["pageToken"] = page_token
        resp = drive.files().list(**params).execute()
        for f in resp.get("files", []):
            part_no = os.path.splitext(f["name"])[0]   # strip .png
            if part_no in files:
                # duplicate filename in Drive — track as list so we can delete extras
                if isinstance(files[part_no], list):
                    files[part_no].append(f["id"])
                else:
                    files[part_no] = [files[part_no], f["id"]]
            else:
                files[part_no] = f["id"]
        page_token = resp.get("nextPageToken")
        if not page_token:
            break
    return files


def fetch_supabase_catalogue():
    """Return dict of {supplier_part_no: image_url} from supplier_catalogue."""
    records = {}
    offset = 0
    limit  = 1000
    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/supplier_catalogue",
            headers={**SB_HEADERS, "Range-Unit": "items", "Range": f"{offset}-{offset+limit-1}"},
            params={"select": "supplier_part_no,image_url", "order": "id"},
            timeout=30,
        )
        r.raise_for_status()
        rows = r.json()
        for row in rows:
            pn = (row.get("supplier_part_no") or "").strip()
            if pn:
                records[pn] = row.get("image_url") or ""
        if len(rows) < limit:
            break
        offset += limit
    return records


def thumbnail_url(file_id):
    return f"https://drive.google.com/thumbnail?id={file_id}&sz=w200"


def update_supabase_url(part_no, url):
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/supplier_catalogue?supplier_part_no=eq.{part_no}",
        headers=SB_HEADERS,
        json={"image_url": url},
        timeout=15,
    )
    return r.status_code


def main():
    print("Connecting to Google Drive…")
    drive = get_drive_service()
    print("Connected ✓\n")

    print("Listing Drive files…")
    drive_files = list_drive_files(drive)
    print(f"  {len(drive_files)} unique part names in Drive\n")

    print("Fetching Supabase supplier_catalogue…")
    catalogue = fetch_supabase_catalogue()
    print(f"  {len(catalogue)} parts in Supabase\n")

    if DRY_RUN:
        print("*** DRY RUN — no files will be deleted, no Supabase rows updated ***\n")

    deleted   = 0
    kept      = 0
    dup_del   = 0
    sb_updated = 0

    for part_no, file_id in drive_files.items():

        # Handle duplicates: multiple Drive files with the same part number
        if isinstance(file_id, list):
            # Keep the first (oldest), delete the rest
            keep_id   = file_id[0]
            extra_ids = file_id[1:]
            for eid in extra_ids:
                print(f"  DUP  {part_no}  extra file_id={eid} → delete")
                if not DRY_RUN:
                    drive.files().delete(fileId=eid).execute()
                dup_del += 1
            file_id = keep_id

        # Is this part number in Supabase?
        if part_no not in catalogue:
            print(f"  DEL  {part_no}  (not in supplier_catalogue)")
            if not DRY_RUN:
                drive.files().delete(fileId=file_id).execute()
            deleted += 1
            continue

        # Part exists — make sure Supabase has the correct thumbnail URL
        correct_url    = thumbnail_url(file_id)
        existing_url   = catalogue[part_no]
        if existing_url != correct_url:
            print(f"  FIX  {part_no}  url mismatch → update Supabase")
            if not DRY_RUN:
                status = update_supabase_url(part_no, correct_url)
                if status not in (200, 204):
                    print(f"       ✗ HTTP {status}")
                else:
                    sb_updated += 1
            else:
                sb_updated += 1
        else:
            kept += 1

    print(f"""
{'DRY RUN summary' if DRY_RUN else 'Done'}
  Drive files kept   : {kept}
  Drive files deleted: {deleted}
  Duplicates removed : {dup_del}
  Supabase URLs fixed: {sb_updated}

{'Set DRY_RUN = False at the top of the script and re-run to apply.' if DRY_RUN else 'All done ✓'}
""")


if __name__ == "__main__":
    main()
