$(function () {
    // create shortcut for showing modals
    $.fn.showModal = function(title, body) {
        $(this).find('.modal-title').text(title);
        $(this).find('.modal-body').text(body);
        $(this).modal('show');
    }

    // initialize custom bootstrap file inputs
    bsCustomFileInput.init();

    // show form submission results in a modal instead of a new page
    $('[onsubmit-modal]').submit(function (ev) {
        ev.preventDefault();
        var form = ev.target;
        var $submitModal = $(form.getAttribute('onsubmit-modal'));
        $submitModal.showModal('Please Wait', 'Submitting request...');
        
        $.ajax({
            type: 'POST',
            url: form.action,
            data: new FormData(form),
            contentType: false,
            processData: false,
            success: function(data) {
                $submitModal.showModal('Request Submitted', data);
            },
            error: function(jqXHR) {
                $submitModal.showModal('Error', jqXHR.responseText);
            }
          });
    });
});
