<?php

namespace App\Http\Controllers\Api;

use App\Models\ModelJob;
use Symfony\Component\Process\Process;

public function run(Request $request)
{
    $job = ModelJob::create([
        'user_id' => auth()->id(),
        'input_type' => $request->input_type,
        'input_path' => $request->input_path,
        'vram_required' => 12000,
        'status' => 'running'
    ]);

    $process = new Process([
        'python3',
        'python/run_hunyuan.py',
        $job->input_path,
        $job->id
    ]);

    $process->run();

    if (!$process->isSuccessful()) {
        $job->update([
            'status' => 'failed',
            'error_log' => $process->getErrorOutput()
        ]);
    }

    return response()->json($job);
}
