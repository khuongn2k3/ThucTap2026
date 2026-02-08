<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class ConvertController extends Controller
{
    /**
     * Gửi job sang hunyuan_service (FastAPI)
     */
    public function runModel(Request $request)
    {
        $request->validate([
            'image_path' => 'required|string'
        ]);

        $jobId = (string) Str::uuid();

        // image_path phải nằm trong volume chung, ví dụ:
        // /data/input/test.png
        $imagePath = $request->input('image_path');

        try {
            $response = Http::timeout(5)->post(
                'http://hunyuan_service:8001/convert',
                [
                    'job_id'     => $jobId,
                    'image_path' => $imagePath,
                ]
            );
        } catch (\Throwable $e) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Cannot connect to hunyuan_service',
                'detail'  => $e->getMessage(),
            ], 500);
        }

        if ($response->failed()) {
            return response()->json([
                'status'  => 'error',
                'message' => 'hunyuan_service returned error',
                'detail'  => $response->body(),
            ], 500);
        }

        return response()->json([
            'status'           => 'started',
            'job_id'           => $jobId,
            'service_response' => $response->json(),
        ]);
    }

    /**
     * Lấy kết quả model (.glb)
     */
    public function getResult(string $jobId)
    {
        $resultPath = "/data/results/{$jobId}.glb";

        if (!file_exists($resultPath)) {
            return response()->json([
                'status' => 'processing'
            ], 202);
        }

        return response()->file($resultPath, [
            'Content-Type' => 'model/gltf-binary'
        ]);
    }
}
