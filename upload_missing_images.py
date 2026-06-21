import os
import pickle
import requests
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request

# ==============================================================================
# CONFIGURATION
# ==============================================================================
IMAGES_FOLDER     = r"C:\Users\Tim\Desktop\SHORT_ITEM_PCS"
GDRIVE_FOLDER_ID  = "1V8p-3JGiWKG80F0ccOLhQJKf7AvtqT_f"
OAUTH_CLIENT_FILE = r"C:\Users\Tim\Desktop\oauth_client.json"
TOKEN_FILE        = r"C:\Users\Tim\Desktop\gdrive_token.pkl"

SUPABASE_URL = "https://lskouiyvdngdzaquurhk.supabase.co"
SUPABASE_KEY = "sb_publishable_De4neqOoFn1wFyiVzaNT0A_HzPAE3YW"

SCOPES = ["https://www.googleapis.com/auth/drive.file"]
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


def fetch_empty_image_parts():
    """Return list of supplier_part_no where image_url is empty or null."""
    parts = []
    offset = 0
    limit  = 1000
    while True:
        r = requests.get(
            f"{SUPABASE_URL}/rest/v1/supplier_catalogue",
            headers={**SB_HEADERS, "Range-Unit": "items", "Range": f"{offset}-{offset+limit-1}"},
            params={
                "select": "supplier_part_no",
                "or":     "(image_url.is.null,image_url.eq.)",
                "order":  "supplier_part_no",
            },
            timeout=30,
        )
        r.raise_for_status()
        rows = r.json()
        for row in rows:
            pn = (row.get("supplier_part_no") or "").strip()
            if pn:
                parts.append(pn)
        if len(rows) < limit:
            break
        offset += limit
    return parts


def upload_file(drive, local_path, filename):
    meta  = {"name": filename, "parents": [GDRIVE_FOLDER_ID]}
    media = MediaFileUpload(local_path, mimetype="image/png", resumable=False)
    f = drive.files().create(body=meta, media_body=media, fields="id").execute()
    file_id = f["id"]
    drive.permissions().create(
        fileId=file_id,
        body={"role": "reader", "type": "anyone"},
    ).execute()
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
    # Index all PNG files in the local IMAGES folder by part number (case-insensitive)
    local_images = {}
    for fname in os.listdir(IMAGES_FOLDER):
        if fname.lower().endswith(".png"):
            part_no = os.path.splitext(fname)[0]
            local_images[part_no.upper()] = os.path.join(IMAGES_FOLDER, fname)
    print(f"Found {len(local_images)} images in {IMAGES_FOLDER}")

    print("Fetching parts with empty image_url from Supabase…")
    empty_parts = fetch_empty_image_parts()
    print(f"  {len(empty_parts)} parts have no image URL\n")

    if not empty_parts:
        print("Nothing to do — all parts already have image URLs.")
        return

    print("Connecting to Google Drive…")
    drive = get_drive_service()
    print("Connected ✓\n")

    uploaded  = 0
    no_image  = 0
    errors    = 0

    for part_no in empty_parts:
        local_path = local_images.get(part_no.upper())
        if not local_path:
            print(f"  ⚠  No local image for {part_no}")
            no_image += 1
            continue

        try:
            url = upload_file(drive, local_path, f"{part_no}.png")
            status = update_supabase_url(part_no, url)
            if status in (200, 204):
                print(f"  ✓  {part_no}")
                uploaded += 1
            else:
                print(f"  ✗  {part_no}  Supabase HTTP {status}")
                errors += 1
        except Exception as e:
            print(f"  ✗  {part_no}  {e}")
            errors += 1

    print(f"""
Done
  Uploaded & linked : {uploaded}
  No local image    : {no_image}
  Errors            : {errors}
""")


if __name__ == "__main__":
    main()
