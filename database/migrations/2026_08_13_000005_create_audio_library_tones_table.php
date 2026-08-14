<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audio_library_tones', function (Blueprint $table) {
            $table->unsignedInteger('id')->primary();
            $table->string('name', 80)->unique();
            $table->text('description');
            $table->string('color', 20);
            $table->boolean('enabled')->default(true);
            $table->timestamps();
        });

        $now = now();
        $tones = json_decode(<<<'JSON'
[{"id":1,"name":"whisper","description":"Speak softly and in a low tone.","color":"#2487de","enable":1},{"id":2,"name":"shout","description":"Raise the voice at a high volume to express intensity or strong emotions.","color":"#FF0000","enable":1},{"id":3,"name":"normal","description":"Use a moderate tone, without particular variations in volume or pitch.","color":"#60adea","enable":1},{"id":4,"name":"sing-song","description":"Speak with a melodious or musical tone.","color":"#FFA500","enable":1},{"id":5,"name":"chat","description":"Converse in an informal and often lively manner.","color":"#0000FF","enable":1},{"id":6,"name":"hushed","description":"Speak in a reserved manner or with a tone of confidence.","color":"#708090","enable":1},{"id":7,"name":"murmur","description":"Speak indistinctly or barely audibly.","color":"#A9A9A9","enable":1},{"id":8,"name":"yell","description":"Raise the voice suddenly and loudly.","color":"#FF4500","enable":1},{"id":9,"name":"complain","description":"Speak with a whiny tone or continuously complain.","color":"#FFD700","enable":1},{"id":10,"name":"narrate","description":"Tell with emphasis, as if reading a story.","color":"#00CED1","enable":1},{"id":11,"name":"encourage","description":"Speak with a tone of encouragement or urging someone to do something.","color":"#32CD32","enable":1},{"id":12,"name":"plead","description":"Speak in a pleading or imploring manner.","color":"#FF69B4","enable":1},{"id":13,"name":"laugh","description":"Express joy or amusement through the sound of laughter.","color":"#FFFF00","enable":1},{"id":14,"name":"cry","description":"Express sadness or sorrow through the sound of crying.","color":"#00FFFF","enable":1},{"id":15,"name":"sarcasm","description":"Speak with a sarcastic or mocking tone.","color":"#800080","enable":1},{"id":16,"name":"authoritative","description":"Speak with a dominant or commanding tone.","color":"#000080","enable":1},{"id":17,"name":"doubtful","description":"Speak with an uncertain or full of doubts tone.","color":"#4682B4","enable":1},{"id":18,"name":"sweet","description":"Speak with an affectionate and delicate tone.","color":"#FFB6C1","enable":1},{"id":19,"name":"formal","description":"Speak in a respectful manner and according to etiquettes rules.","color":"#00008B","enable":1},{"id":20,"name":"angry","description":"Speak with a tone of anger or frustration.","color":"#FF6347","enable":1},{"id":21,"name":"excited","description":"Speak with enthusiasm and high energy.","color":"#FF4500","enable":1},{"id":22,"name":"bored","description":"Speak with a tone indicating lack of interest or enthusiasm.","color":"#808080","enable":1},{"id":23,"name":"nervous","description":"Speak with a shaky or tense tone, indicating anxiety.","color":"#B22222","enable":1},{"id":24,"name":"confident","description":"Speak with certainty and assurance.","color":"#228B22","enable":1},{"id":25,"name":"teasing","description":"Speak in a playful or mocking manner.","color":"#EE82EE","enable":1},{"id":26,"name":"serious","description":"Speak in a grave or solemn tone.","color":"#2F4F4F","enable":1},{"id":27,"name":"joyful","description":"Speak with a tone of happiness and delight.","color":"#FFFF00","enable":1},{"id":28,"name":"empathetic","description":"Speak with understanding and compassion.","color":"#00FF7F","enable":1},{"id":29,"name":"commanding","description":"Speak with a forceful and authoritative tone.","color":"#000080","enable":1},{"id":30,"name":"indifferent","description":"Speak with a tone indicating lack of concern or interest.","color":"#A9A9A9","enable":1},{"id":31,"name":"questioning","description":"Speak with a tone of curiosity or inquiry.","color":"#20B2AA","enable":1},{"id":32,"name":"relaxed","description":"Speak with a calm and easygoing tone.","color":"#ADD8E6","enable":1},{"id":33,"name":"frustrated","description":"Speak with a tone of annoyance or impatience.","color":"#FF7F50","enable":1},{"id":34,"name":"surprised","description":"Speak with a tone indicating surprise or amazement.","color":"#DDA0DD","enable":1},{"id":35,"name":"melancholic","description":"Speak with a tone of sadness or pensiveness.","color":"#778899","enable":1},{"id":36,"name":"sarcastic","description":"Speak with a tone of irony or derision.","color":"#8B0000","enable":1},{"id":37,"name":"cheerful","description":"Speak with a bright and happy tone.","color":"#FFD700","enable":1},{"id":38,"name":"soothing","description":"Speak with a calming and gentle tone.","color":"#00FA9A","enable":1},{"id":39,"name":"scream","description":"Emit a loud, high-pitched cry of fear or terror.","color":"#FF0000","enable":1},{"id":40,"name":"shudder","description":"Speak with a trembling voice, as if overcome by fear.","color":"#800080","enable":1},{"id":41,"name":"hiss","description":"Speak in a sibilant whisper, reminiscent of a snake.","color":"#696969","enable":1},{"id":42,"name":"growl","description":"Speak with a low, guttural, threatening tone.","color":"#8B4513","enable":1},{"id":43,"name":"howl","description":"Emit a long, wailing cry, like that of a wolf or ghost.","color":"#556B2F","enable":1},{"id":44,"name":"shriek","description":"Give a loud, sharp, piercing cry indicative of terror.","color":"#DC143C","enable":1},{"id":45,"name":"tremble","description":"Speak with a quavering voice, showing extreme fear.","color":"#FF4500","enable":1},{"id":46,"name":"menacing","description":"Speak with a tone that suggests danger or threats.","color":"#000000","enable":1},{"id":47,"name":"chilling","description":"Speak in a tone that sends shivers down the spine.","color":"#4682B4","enable":1},{"id":48,"name":"eerie","description":"Speak in a way that is unnervingly strange or frightening.","color":"#4B0082","enable":1},{"id":49,"name":"frantic","description":"Speak in a hurried, panicked, or desperate manner.","color":"#FF6347","enable":1},{"id":50,"name":"ominous","description":"Speak with a tone that forebodes evil or disaster.","color":"#696969","enable":1},{"id":51,"name":"ghostly","description":"Speak with a hollow, echoing voice, like that of a ghost.","color":"#778899","enable":1},{"id":52,"name":"sinister","description":"Speak with a tone that suggests malevolence or ill intent.","color":"#800000","enable":1},{"id":53,"name":"panicked","description":"Speak with a tone showing sudden, uncontrollable fear or anxiety.","color":"#FF4500","enable":1},{"id":54,"name":"foreboding","description":"Speak with a tone that hints at something bad about to happen.","color":"#A9A9A9","enable":1},{"id":55,"name":"haunted","description":"Speak with a tone as if tormented or followed by ghosts.","color":"#2F4F4F","enable":1},{"id":56,"name":"quivering","description":"Speak with a shaking voice, as if paralyzed by fear.","color":"#B22222","enable":1},{"id":57,"name":"breathless","description":"Speak in short, gasping breaths, indicative of fear or exhaustion.","color":"#4682B4","enable":1},{"id":58,"name":"spooked","description":"Speak with a tone showing sudden fright or alarm.","color":"#696969","enable":1},{"id":59,"name":"paranoid","description":"Speak with a tone of irrational fear or distrust.","color":"#708090","enable":1},{"id":60,"name":"unnerving","description":"Speak in a tone that makes others feel uneasy or scared.","color":"#4B0082","enable":1},{"id":61,"name":"dreadful","description":"Speak with a tone full of great fear or apprehension.","color":"#800080","enable":1},{"id":62,"name":"mournful","description":"Speak with a tone expressing sorrow or regret, often associated with horror.","color":"#2F4F4F","enable":1},{"id":63,"name":"terrified","description":"Speak with a tone of extreme fear.","color":"#FF0000","enable":1},{"id":64,"name":"horrified","description":"Speak with a tone indicating shock and horror.","color":"#DC143C","enable":1},{"id":65,"name":"macabre","description":"Speak with a tone that is grim, ghastly, or related to death.","color":"#8B0000","enable":1},{"id":66,"name":"creepy","description":"Speak in a tone that causes an uneasy feeling of fear or discomfort.","color":"#4B0082","enable":1},{"id":67,"name":"disturbing","description":"Speak with a tone that deeply unsettles or worries the listener.","color":"#696969","enable":1},{"id":68,"name":"spectral","description":"Speak with a tone reminiscent of a ghost or phantom.","color":"#778899","enable":1}]
JSON, true, 512, JSON_THROW_ON_ERROR);

        DB::table('audio_library_tones')->insert(array_map(
            fn (array $tone) => [
                'id' => $tone['id'],
                'name' => $tone['name'],
                'description' => $tone['description'],
                'color' => $tone['color'],
                'enabled' => (bool) $tone['enable'],
                'created_at' => $now,
                'updated_at' => $now,
            ],
            $tones,
        ));

        Schema::table('audio_library_voice_samples', function (Blueprint $table) {
            $table->foreignId('tone_id')->nullable()->constrained('audio_library_tones')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('audio_library_voice_samples', function (Blueprint $table) {
            $table->dropConstrainedForeignId('tone_id');
        });

        Schema::dropIfExists('audio_library_tones');
    }
};
