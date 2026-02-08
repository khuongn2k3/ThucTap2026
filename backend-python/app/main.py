from fastapi import FastAPI
from pydantic import BaseModel
import uuid
import asyncio

app = FastAPI()

class RunRequest(BaseModel):
    prompt: str

@app.post("/run")
async def run(req: RunRequest):
    job_id = str(uuid.uuid4())

    # ⛔ BLOCKING → đưa sang thread
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: model.generate(
            prompt=req.prompt,
            output_dir=f"/data/results/{job_id}"
        )
    )

    return {
        "status": "done",
        "job_id": job_id,
        "output": result
    }
