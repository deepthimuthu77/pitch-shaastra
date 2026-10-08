import asyncio
import hashlib
import json
import sqlite3
import time
import uuid
from contextlib import contextmanager
from functools import lru_cache

from backend.config import settings


class SQLiteStore:
    def __init__(self):
        settings().data_dir.mkdir(parents=True, exist_ok=True)
        self.path = settings().data_dir / "pitchgrill.db"
        with self.db() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS records (
                  uid TEXT, kind TEXT, id TEXT, data TEXT, updated REAL,
                  PRIMARY KEY(uid,kind,id)
                );
                CREATE TABLE IF NOT EXISTS jobs (
                  id TEXT PRIMARY KEY, uid TEXT, analysis_id TEXT, state TEXT,
                  lease REAL DEFAULT 0, attempts INTEGER DEFAULT 0, created REAL
                );
                CREATE TABLE IF NOT EXISTS locks (
                  key TEXT PRIMARY KEY, lease REAL, token TEXT
                );
                CREATE INDEX IF NOT EXISTS records_updated ON records(updated);
                CREATE INDEX IF NOT EXISTS jobs_state ON jobs(state,created);
                CREATE TABLE IF NOT EXISTS deleted_users (id TEXT PRIMARY KEY);
            """)

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        try:
            yield db
            db.commit()
        finally:
            db.close()

    def put(self, uid, kind, id, data):
        encoded = json.dumps(data, allow_nan=False)
        if len(encoded.encode()) > 850_000:
            raise ValueError("Record exceeds storage budget")
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            if db.execute(
                "SELECT 1 FROM deleted_users WHERE id=?", (hashlib.sha256(uid.encode()).hexdigest(),)
            ).fetchone():
                raise ValueError("Workspace was deleted")
            db.execute(
                "INSERT OR REPLACE INTO records VALUES(?,?,?,?,?)", (uid, kind, id, encoded, time.time())
            )

    def get(self, uid, kind, id):
        with self.db() as db:
            row = db.execute(
                "SELECT data FROM records WHERE uid=? AND kind=? AND id=?", (uid, kind, id)
            ).fetchone()
            return json.loads(row[0]) if row else None

    def list(self, uid, kind, limit=200):
        with self.db() as db:
            return [
                json.loads(row[0])
                for row in db.execute(
                    "SELECT data FROM records WHERE uid=? AND kind=? ORDER BY updated DESC LIMIT ?",
                    (uid, kind, limit),
                )
            ]

    def delete(self, uid, kind, id):
        with self.db() as db:
            db.execute("DELETE FROM records WHERE uid=? AND kind=? AND id=?", (uid, kind, id))

    def delete_kind(self, uid, kind):
        with self.db() as db:
            db.execute("DELETE FROM records WHERE uid=? AND kind=?", (uid, kind))

    def delete_user(self, uid):
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            db.execute(
                "INSERT OR IGNORE INTO deleted_users VALUES(?)", (hashlib.sha256(uid.encode()).hexdigest(),)
            )
            db.execute("DELETE FROM records WHERE uid=?", (uid,))
            db.execute("DELETE FROM jobs WHERE uid=?", (uid,))
            db.execute("DELETE FROM records WHERE kind='shares' AND json_extract(data,'$.uid')=?", (uid,))

    def is_deleted(self, uid):
        with self.db() as db:
            return bool(
                db.execute(
                    "SELECT 1 FROM deleted_users WHERE id=?", (hashlib.sha256(uid.encode()).hexdigest(),)
                ).fetchone()
            )

    def acquire(self, key, seconds=180):
        token = uuid.uuid4().hex
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            row = db.execute("SELECT lease FROM locks WHERE key=?", (key,)).fetchone()
            if row and row[0] > time.time():
                return None
            db.execute("INSERT OR REPLACE INTO locks VALUES(?,?,?)", (key, time.time() + seconds, token))
        return token

    def release(self, key, token):
        with self.db() as db:
            db.execute("DELETE FROM locks WHERE key=? AND token=?", (key, token))

    def enqueue(self, uid, analysis_id):
        id = uuid.uuid4().hex
        with self.db() as db:
            db.execute(
                "INSERT INTO jobs(id,uid,analysis_id,state,created) VALUES(?,?,?,?,?)",
                (id, uid, analysis_id, "queued", time.time()),
            )
        return id

    def claim(self, id=None):
        now = time.time()
        with self.db() as db:
            db.execute("BEGIN IMMEDIATE")
            for exhausted in db.execute(
                "SELECT uid,analysis_id,id FROM jobs WHERE state='running' AND lease<? AND attempts>=3",
                (now,),
            ).fetchall():
                db.execute("UPDATE jobs SET state='failed',lease=0 WHERE id=?", (exhausted["id"],))
                row = db.execute(
                    "SELECT data FROM records WHERE uid=? AND kind='analyses' AND id=?",
                    (exhausted["uid"], exhausted["analysis_id"]),
                ).fetchone()
                if row:
                    record = json.loads(row[0])
                    record.update(
                        status="failed",
                        error="Worker retry budget exhausted. Partial sections are preserved; rerun from the report.",
                    )
                    db.execute(
                        "UPDATE records SET data=?,updated=? WHERE uid=? AND kind='analyses' AND id=?",
                        (json.dumps(record), now, exhausted["uid"], exhausted["analysis_id"]),
                    )
            sql = "SELECT * FROM jobs WHERE (state='queued' OR (state='running' AND lease<?)) AND attempts<3"
            params = [now]
            if id:
                sql += " AND id=?"
                params.append(id)
            row = db.execute(sql + " ORDER BY created LIMIT 1", params).fetchone()
            if not row:
                return None
            db.execute(
                "UPDATE jobs SET state='running',lease=?,attempts=attempts+1 WHERE id=?",
                (now + 900, row["id"]),
            )
            return dict(row)

    def finish_job(self, id, state):
        with self.db() as db:
            db.execute("UPDATE jobs SET state=?,lease=0 WHERE id=?", (state, id))

    def job_state(self, id):
        with self.db() as db:
            row = db.execute("SELECT state FROM jobs WHERE id=?", (id,)).fetchone()
            return row[0] if row else None

    def heartbeat(self):
        self.put("system", "health", "worker", {"time": time.time()})

    def purge(self, days):
        cutoff = time.time() - days * 86400
        with self.db() as db:
            db.execute("DELETE FROM records WHERE updated<?", (cutoff,))
            db.execute("DELETE FROM jobs WHERE created<?", (cutoff,))
            db.execute("DELETE FROM locks WHERE lease<?", (time.time(),))


class FirestoreStore:
    def __init__(self):
        from firebase_admin import firestore

        from backend.security import initialize_firebase

        initialize_firebase()
        self.client = firestore.client()

    def ref(self, uid, kind, id=None):
        collection = self.client.collection("users").document(uid).collection(kind)
        return collection.document(id) if id else collection

    def put(self, uid, kind, id, data):
        if len(json.dumps(data, allow_nan=False).encode()) > 850_000:
            raise ValueError("Record exceeds storage budget")
        from google.cloud import firestore

        marker = self.client.collection("deleted_workspaces").document(
            hashlib.sha256(uid.encode()).hexdigest()
        )

        @firestore.transactional
        def transaction(tx):
            if marker.get(transaction=tx).exists:
                raise ValueError("Workspace was deleted")
            tx.set(self.ref(uid, kind, id), {"data": data, "updated": time.time()})

        transaction(self.client.transaction())

    def get(self, uid, kind, id):
        snapshot = self.ref(uid, kind, id).get()
        return snapshot.to_dict()["data"] if snapshot.exists else None

    def list(self, uid, kind, limit=200):
        return [
            s.to_dict()["data"]
            for s in self.ref(uid, kind).order_by("updated", direction="DESCENDING").limit(limit).stream()
        ]

    def delete(self, uid, kind, id):
        self.ref(uid, kind, id).delete()

    def delete_kind(self, uid, kind):
        for document in self.ref(uid, kind).stream():
            document.reference.delete()

    def delete_user(self, uid):
        from google.cloud.firestore_v1.base_query import FieldFilter

        self.client.collection("deleted_workspaces").document(hashlib.sha256(uid.encode()).hexdigest()).set(
            {"deleted": True}
        )
        self.client.recursive_delete(self.client.collection("users").document(uid))
        for doc in self.client.collection("jobs").where(filter=FieldFilter("uid", "==", uid)).stream():
            doc.reference.delete()
        for doc in self.ref("system", "shares").stream():
            if doc.to_dict().get("data", {}).get("uid") == uid:
                doc.reference.delete()

    def is_deleted(self, uid):
        return (
            self.client.collection("deleted_workspaces")
            .document(hashlib.sha256(uid.encode()).hexdigest())
            .get()
            .exists
        )

    def acquire(self, key, seconds=180):
        from google.cloud import firestore

        ref = self.client.collection("locks").document(key)
        token = uuid.uuid4().hex

        @firestore.transactional
        def transaction(tx):
            snap = ref.get(transaction=tx)
            if snap.exists and snap.to_dict()["lease"] > time.time():
                return None
            tx.set(ref, {"lease": time.time() + seconds, "token": token})
            return token

        return transaction(self.client.transaction())

    def release(self, key, token):
        from google.cloud import firestore

        ref = self.client.collection("locks").document(key)

        @firestore.transactional
        def transaction(tx):
            snap = ref.get(transaction=tx)
            if snap.exists and snap.to_dict().get("token") == token:
                tx.delete(ref)

        transaction(self.client.transaction())

    def enqueue(self, uid, analysis_id):
        ref = self.client.collection("jobs").document()
        ref.set(
            {
                "id": ref.id,
                "uid": uid,
                "analysis_id": analysis_id,
                "state": "queued",
                "attempts": 0,
                "lease": 0,
                "created": time.time(),
            }
        )
        return ref.id

    def claim(self, id=None):
        from google.cloud import firestore
        from google.cloud.firestore_v1.base_query import FieldFilter

        if id:
            refs = [self.client.collection("jobs").document(id)]
        else:
            refs = [
                d.reference
                for state in ("queued", "running")
                for d in self.client.collection("jobs")
                .where(filter=FieldFilter("state", "==", state))
                .limit(20)
                .stream()
            ]

        @firestore.transactional
        def transaction(tx, ref):
            snapshot = ref.get(transaction=tx)
            if not snapshot.exists:
                return None
            job = snapshot.to_dict()
            if job["attempts"] >= 3 and job["state"] == "running" and job["lease"] < time.time():
                analysis = self.ref(job["uid"], "analyses", job["analysis_id"])
                record = analysis.get(transaction=tx)
                tx.update(ref, {"state": "failed", "lease": 0})
                if record.exists:
                    data = record.to_dict()["data"]
                    data.update(
                        status="failed",
                        error="Worker retry budget exhausted. Partial sections are preserved; rerun from the report.",
                    )
                    tx.update(analysis, {"data": data, "updated": time.time()})
                return None
            if (
                job["attempts"] >= 3
                or job["state"] not in {"queued", "running"}
                or (job["state"] == "running" and job["lease"] > time.time())
            ):
                return None
            tx.update(ref, {"state": "running", "lease": time.time() + 900, "attempts": job["attempts"] + 1})
            return job

        for ref in refs:
            job = transaction(self.client.transaction(), ref)
            if job:
                return job
        return None

    def finish_job(self, id, state):
        self.client.collection("jobs").document(id).update({"state": state, "lease": 0})

    def job_state(self, id):
        snapshot = self.client.collection("jobs").document(id).get()
        return snapshot.to_dict()["state"] if snapshot.exists else None

    def heartbeat(self):
        self.put("system", "health", "worker", {"time": time.time()})

    def purge(self, days):
        from google.cloud.firestore_v1.base_query import FieldFilter

        cutoff = time.time() - days * 86400
        for document in (
            self.client.collection_group("analyses")
            .where(filter=FieldFilter("updated", "<", cutoff))
            .stream()
        ):
            uid, id = document.reference.parent.parent.id, document.id
            self.delete_kind(uid, "sections_" + id)
            document.reference.delete()
        for kind in ("pitches", "shares", "calls", "invites"):
            for document in (
                self.client.collection_group(kind).where(filter=FieldFilter("updated", "<", cutoff)).stream()
            ):
                document.reference.delete()
        for document in (
            self.client.collection("jobs").where(filter=FieldFilter("created", "<", cutoff)).stream()
        ):
            document.reference.delete()
        for document in (
            self.client.collection("locks").where(filter=FieldFilter("lease", "<", time.time())).stream()
        ):
            document.reference.delete()


class Repository:
    def __init__(self):
        self.backend = FirestoreStore() if settings().storage_backend == "firestore" else SQLiteStore()

    def __getattr__(self, name):
        method = getattr(self.backend, name)

        async def wrapped(*args, **kwargs):
            return await asyncio.to_thread(method, *args, **kwargs)

        return wrapped


@lru_cache
def store():
    return Repository()
