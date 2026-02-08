<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\ImageController;
use App\Http\Controllers\Api\ConvertController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\GoogleAuthController;
use App\Http\Controllers\Api\ProfileController;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

// ===== Public API (KHÔNG cần JWT) =====

Route::post('/register', [AuthController::class, 'register']);
Route::post('/login', [AuthController::class, 'login']);

Route::get('/auth/google/redirect', [GoogleAuthController::class, 'redirect']);
Route::get('/auth/google/callback', [GoogleAuthController::class, 'callback']);


// ===== Protected API (JWT) =====
Route::middleware('auth:api')->group(function () {

    // Auth
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    // Feature
    Route::post('/upload-image', [ImageController::class, 'upload']);
    Route::post('/convert', [ConvertController::class, 'runModel']);

    // Profile
    Route::post('/me/update', [ProfileController::class, 'update']);
    Route::post('/me/change-password', [ProfileController::class, 'changePassword']);
});
