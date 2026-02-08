<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('model_jobs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->onDelete('cascade');
        
            $table->enum('input_type', ['1_image', '4_images']);
            $table->string('input_path');
        
            $table->string('output_model')->nullable(); // .obj / .glb
            $table->integer('vram_required'); // MB
            $table->integer('vram_used')->nullable();
        
            $table->enum('status', [
                'pending',
                'running',
                'done',
                'failed'
            ])->default('pending');
        
            $table->text('error_log')->nullable();
            $table->timestamps();
        });        
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('model_jobs');
    }
};
